-- =====================================================================
-- FINES - Production | 003: skupni normativ = vsota oddelkov
--
-- Pri uvozu iz Excela so se pri nekaterih družinah deleži oddelkov
-- sešteli v 101 % (npr. ODC 14 + 58 + 13 + 16), zato je vsota oddelkov
-- večja od skupnega normativa.
--
-- 1. Enkraten popravek: skupni normativ ostane, oddelki se sorazmerno
--    razdelijo nanj (3 decimalke, ostanek zaokroževanja gre največjemu).
-- 2. Pravilo (constraint): odslej mora biti vsota oddelkov = skupni.
-- Zaženi PO 002_normativi_zasedenost.sql. Idempotentno.
-- =====================================================================

do $$
declare
  r record;
  vsota numeric;
  d numeric[];
  ostanek numeric;
  i_max int;
begin
  for r in
    select id, normativ_skupni,
           array[normativ_proizvodnja, normativ_montaza, normativ_elektro, normativ_testiranje] as deli
    from spl_normativi
    where abs(normativ_skupni - (normativ_proizvodnja + normativ_montaza + normativ_elektro + normativ_testiranje)) > 0.0005
  loop
    vsota := r.deli[1] + r.deli[2] + r.deli[3] + r.deli[4];

    if vsota = 0 then
      -- ni oddelkov: skupni ostane, vse se pripiše proizvodnji
      d := array[r.normativ_skupni, 0, 0, 0];
    else
      d := array[
        round(r.deli[1] * r.normativ_skupni / vsota, 3),
        round(r.deli[2] * r.normativ_skupni / vsota, 3),
        round(r.deli[3] * r.normativ_skupni / vsota, 3),
        round(r.deli[4] * r.normativ_skupni / vsota, 3)
      ];
      ostanek := r.normativ_skupni - (d[1] + d[2] + d[3] + d[4]);
      if ostanek <> 0 then
        i_max := 1;
        for i in 2..4 loop
          if d[i] > d[i_max] then i_max := i; end if;
        end loop;
        d[i_max] := d[i_max] + ostanek;
      end if;
    end if;

    update spl_normativi
       set normativ_proizvodnja = d[1],
           normativ_montaza     = d[2],
           normativ_elektro     = d[3],
           normativ_testiranje  = d[4]
     where id = r.id;
  end loop;
end;
$$;

alter table spl_normativi drop constraint if exists spl_normativi_vsota;
alter table spl_normativi add constraint spl_normativi_vsota check (
  abs(normativ_skupni - (normativ_proizvodnja + normativ_montaza + normativ_elektro + normativ_testiranje)) <= 0.0005
);
