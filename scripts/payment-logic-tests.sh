#!/bin/bash
# Real payment-logic tests against a live Postgres with the production migrations applied.
# Each test prints PASS/FAIL with the observed value, so a failure is self-explaining.
SOCK=/tmp/wmpg
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" LANG=C LC_ALL=C
Q() { psql -h $SOCK -p 55432 -U postgres -d wm5 -tAqc "$1" 2>&1; }
PASS=0; FAIL=0
chk() { # chk <name> <actual> <expected>
  if [ "$2" == "$3" ]; then printf "  PASS  %-58s %s\n" "$1" "$2"; PASS=$((PASS+1));
  else printf "  FAIL  %-58s got=%s want=%s\n" "$1" "$2" "$3"; FAIL=$((FAIL+1)); fi
}

echo "=============== 1. DOUBLE-SELL UNDER REAL CONCURRENCY ==============="
# 12 processes race to reserve the SAME 3 cells at the same instant.
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null, reserved_by_ip_hash=null where id in (100100,100101,100102);" >/dev/null
for i in $(seq 1 12); do
  psql -h $SOCK -p 55432 -U postgres -d wm5 -tAqc \
    "select success from reserve_cells_atomic(ARRAY[100100,100101,100102], ARRAY['A','B','C'], gen_random_uuid(), 'ip-race-$i', ARRAY[NULL,NULL,NULL]::text[], 2100, 300, 300);" \
    > /tmp/wmrace_$i.out 2>&1 &
done
wait
WINNERS=$(cat /tmp/wmrace_*.out | grep -c '^t$')
LOSERS=$(cat /tmp/wmrace_*.out | grep -c '^f$')
rm -f /tmp/wmrace_*.out
chk "exactly one of 12 concurrent racers wins the same cells" "$WINNERS" "1"
chk "the other 11 are cleanly rejected (no errors/crashes)" "$LOSERS" "11"
chk "cells are held by exactly one reservation" "$(Q "select count(distinct reservation_id) from cells where id in (100100,100101,100102) and status='reserved';")" "1"

echo
echo "=============== 2. RESERVING A SOLD CELL IS IMPOSSIBLE ==============="
Q "update cells set status='sold', reservation_id=gen_random_uuid(), character='X', purchased_at=now() where id=200200;" >/dev/null
chk "reserve on a sold cell returns success=false" "$(Q "select success from reserve_cells_atomic(ARRAY[200200], ARRAY['Z'], gen_random_uuid(), 'ip-sold', ARRAY[NULL]::text[], 2100, 300, 300);")" "f"
chk "the sold cell's character is untouched" "$(Q "select character from cells where id=200200;")" "X"

echo
echo "=============== 3. EXPIRED HOLD SELF-HEALS (no cell is lost) ==============="
RES_EXP=$(Q "select gen_random_uuid();")
Q "update cells set status='reserved', reservation_id='$RES_EXP', reserved_until=now() - interval '1 hour', character='Q' where id=300300;" >/dev/null
chk "a new buyer CAN take a cell whose hold has lapsed" "$(Q "select success from reserve_cells_atomic(ARRAY[300300], ARRAY['N'], gen_random_uuid(), 'ip-heal', ARRAY[NULL]::text[], 2100, 300, 300);")" "t"

echo
echo "=============== 4. PER-IP CONCURRENT HOLD CAP ==============="
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null, reserved_by_ip_hash=null where id between 400000 and 400020;" >/dev/null
Q "select reserve_cells_atomic(ARRAY[400001,400002,400003], ARRAY['A','B','C'], gen_random_uuid(), 'ip-cap', ARRAY[NULL,NULL,NULL]::text[], 2100, 300, 3);" >/dev/null
CAPMSG=$(Q "select reserve_cells_atomic(ARRAY[400004], ARRAY['D'], gen_random_uuid(), 'ip-cap', ARRAY[NULL]::text[], 2100, 300, 3);")
echo "$CAPMSG" | grep -qi "cap exceeded" && chk "4th cell over a 3-cell per-IP cap is refused" "capped" "capped" || chk "4th cell over a 3-cell per-IP cap is refused" "NOT-CAPPED:$CAPMSG" "capped"

echo
echo "=============== 5. PURCHASE COMPLETION (the money moment) ==============="
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null where id between 500000 and 500010;" >/dev/null
Q "delete from monument_stats; insert into monument_stats(id,sold_count,total_cents) values (true,0,0);" >/dev/null
Q "update tile_summary set sold_count=0;" >/dev/null
RES=$(Q "select gen_random_uuid();")
Q "select reserve_cells_atomic(ARRAY[500001,500002,500003], ARRAY['H','I','!'], '$RES', 'ip-buy', ARRAY[NULL,NULL,NULL]::text[], 2100, 300, 300);" >/dev/null
chk "complete_purchase_atomic succeeds for a live hold" "$(Q "select success from complete_purchase_atomic('$RES','cs_test_1',100);")" "t"
chk "all 3 cells are now sold" "$(Q "select count(*) from cells where reservation_id='$RES' and status='sold';")" "3"
chk "monument_stats.sold_count is exact" "$(Q "select sold_count from monument_stats;")" "3"
chk "monument_stats.total_cents is exact (3 x \$1)" "$(Q "select total_cents from monument_stats;")" "300"
chk "tile_summary was incremented" "$(Q "select coalesce(sum(sold_count),0) from tile_summary;")" "3"

echo
echo "=============== 6. WEBHOOK IDEMPOTENCY (Stripe retries the same event) ==============="
R2=$(Q "select success from complete_purchase_atomic('$RES','cs_test_1',100);")
REASON2=$(Q "select reason from complete_purchase_atomic('$RES','cs_test_1',100);")
chk "replayed webhook does NOT double-count sold_count" "$(Q "select sold_count from monument_stats;")" "3"
chk "replayed webhook does NOT double-count revenue" "$(Q "select total_cents from monument_stats;")" "300"
chk "replay reports already_sold, not a hard failure" "$REASON2" "already_sold"

echo
echo "=============== 7. PAID-BUT-EXPIRED RACE (customer charged, hold gone) ==============="
RES3=$(Q "select gen_random_uuid();")
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null where id=600600;" >/dev/null
CONFLICT=$(Q "select reason from complete_purchase_atomic('$RES3','cs_test_ghost',100);")
chk "completing a vanished reservation is refused (triggers refund path)" "$CONFLICT" "reservation_not_found_or_conflict"
chk "no phantom cells were sold by the failed completion" "$(Q "select count(*) from cells where reservation_id='$RES3';")" "0"

echo
echo "=============== 8. PARTIAL FULFILMENT GUARD (all-or-nothing) ==============="
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null where id between 700000 and 700010;" >/dev/null
RES4=$(Q "select gen_random_uuid();")
Q "select reserve_cells_atomic(ARRAY[700001,700002,700003], ARRAY['A','B','C'], '$RES4', 'ip-partial', ARRAY[NULL,NULL,NULL]::text[], 2100, 300, 300);" >/dev/null
# Sabotage one cell mid-flight, exactly like a sweep or another buyer stealing it.
Q "update cells set status='available', reservation_id=null, reserved_until=null where id=700002;" >/dev/null
# Contract (see src/app/api/webhooks/stripe/route.ts:57-81): the RPC delivers the
# cells that survive and RETURNS them; the webhook compares paid vs delivered and
# refunds the exact shortfall. So what must hold is: returned ids == cells actually
# sold, and the stolen cell is not sold. That makes the refund math provably right.
DELIVERED=$(Q "select cardinality(cell_ids) from complete_purchase_atomic('$RES4','cs_test_partial',100);")
SOLD_PARTIAL=$(Q "select count(*) from cells where reservation_id='$RES4' and status='sold';")
chk "delivered-cell count matches cells actually sold (refund math is exact)" "$DELIVERED" "$SOLD_PARTIAL"
chk "the stolen cell is NOT sold to the paying buyer" "$(Q "select count(*) from cells where id=700002 and status='sold';")" "0"
chk "buyer paid 3 x \$1 but got 2 cells -> webhook owes exactly \$1 back" "$(Q "select 300 - ($SOLD_PARTIAL * 100);")" "100"

echo
echo "=============== 9. HOLD EXTENSION (Stripe 30-min minimum alignment) ==============="
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null where id between 800000 and 800010;" >/dev/null
RES5=$(Q "select gen_random_uuid();")
Q "select reserve_cells_atomic(ARRAY[800001,800002], ARRAY['E','X'], '$RES5', 'ip-ext', ARRAY[NULL,NULL]::text[], 2100, 300, 300);" >/dev/null
Q "update cells set reserved_until = now() + interval '60 seconds' where reservation_id='$RES5';" >/dev/null
EXTENDED=$(Q "select extend_reservation('$RES5', 2100);")
chk "extend_reservation touches every cell in the hold" "$EXTENDED" "2"
chk "hold now outlives the Stripe session window" "$(Q "select case when min(reserved_until) > now() + interval '30 minutes' then 'yes' else 'no' end from cells where reservation_id='$RES5';")" "yes"
chk "extending a dead reservation is a no-op, not a crash" "$(Q "select extend_reservation(gen_random_uuid(), 2100);")" "0"

echo
echo "=============== 10. RELEASE + SWEEP (abandoned checkouts free their cells) ==============="
RES6=$(Q "select gen_random_uuid();")
Q "update cells set status='available', reservation_id=null, reserved_until=null, character=null where id between 900000 and 900010;" >/dev/null
Q "select reserve_cells_atomic(ARRAY[900001,900002], ARRAY['A','B'], '$RES6', 'ip-rel', ARRAY[NULL,NULL]::text[], 2100, 300, 300);" >/dev/null
chk "release_reservation frees exactly its own cells" "$(Q "select release_reservation('$RES6');")" "2"
chk "released cells are available again" "$(Q "select count(*) from cells where id in (900001,900002) and status='available';")" "2"
RES7=$(Q "select gen_random_uuid();")
Q "select reserve_cells_atomic(ARRAY[900005,900006], ARRAY['C','D'], '$RES7', 'ip-sweep', ARRAY[NULL,NULL]::text[], 2100, 300, 300);" >/dev/null
Q "update cells set reserved_until = now() - interval '1 minute' where reservation_id='$RES7';" >/dev/null
chk "sweep reclaims expired holds" "$(Q "select sweep_expired_reservations(5000);")" "2"
chk "sweep leaves live holds alone" "$(Q "select count(*) from cells where reservation_id='$RES5' and status='reserved';")" "2"
chk "sweep never touches sold cells" "$(Q "select count(*) from cells where reservation_id='$RES' and status='sold';")" "3"

echo
echo "=============== 11. PRIVACY: what the public (anon) key can actually read ==============="
chk "anon CANNOT read the cells base table" "$(Q "select has_table_privilege('anon','cells','SELECT');")" "f"
chk "anon CAN read the cells_public view" "$(Q "select has_table_privilege('anon','cells_public','SELECT');")" "t"
chk "public view hides buyer IP hashes" "$(Q "select count(*) from information_schema.columns where table_name='cells_public' and column_name='reserved_by_ip_hash';")" "0"
chk "public view hides Stripe session ids" "$(Q "select count(*) from information_schema.columns where table_name='cells_public' and column_name='stripe_session_id';")" "0"
chk "anon cannot write to the public view" "$(Q "select has_table_privilege('anon','cells_public','UPDATE');")" "f"
chk "anon cannot execute the reserve RPC directly" "$(Q "select has_function_privilege('anon','reserve_cells_atomic(integer[],text[],uuid,text,text[],integer,integer,integer)','EXECUTE');")" "f"
chk "anon cannot execute the completion RPC directly" "$(Q "select has_function_privilege('anon','complete_purchase_atomic(uuid,text,integer)','EXECUTE');")" "f"
chk "service_role CAN execute the reserve RPC" "$(Q "select has_function_privilege('service_role','reserve_cells_atomic(integer[],text[],uuid,text,text[],integer,integer,integer)','EXECUTE');")" "t"
chk "every base table has RLS enabled" "$(Q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;")" "0"

echo
echo "=============== 12. COUNTER INTEGRITY (displayed numbers match reality) ==============="
# Cell 200200 was forced sold by hand (test 2) bypassing the RPC, so it is excluded.
chk "monument_stats.sold_count equals the real sold-cell count" \
  "$(Q "select case when (select sold_count from monument_stats) = (select count(*) from cells where status='sold' and id <> 200200) then 'match' else 'drift' end;")" "match"
chk "monument_stats.total_cents equals sold_count x \$1 (no revenue drift)" \
  "$(Q "select case when (select total_cents from monument_stats) = (select sold_count from monument_stats) * 100 then 'match' else 'drift' end;")" "match"
chk "tile_summary total equals monument_stats.sold_count" \
  "$(Q "select case when (select coalesce(sum(sold_count),0) from tile_summary) = (select sold_count from monument_stats) then 'match' else 'drift' end;")" "match"

echo
echo "==================== RESULT: $PASS passed, $FAIL failed ===================="
[ $FAIL -eq 0 ] || exit 1
