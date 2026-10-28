UPDATE "repartidores" SET "tarifa_paquete" = NULL WHERE "tarifa_paquete" = 0;--> statement-breakpoint
UPDATE "registros_dia" SET "entregados" = "salida" - "vuelta", "incidencias" = "vuelta" WHERE "salida" IS NOT NULL AND "vuelta" IS NOT NULL AND "vuelta" <= "salida";--> statement-breakpoint
ALTER TABLE "registros_dia" DROP COLUMN "vuelta";
