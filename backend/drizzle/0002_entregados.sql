ALTER TABLE "repartidores" ALTER COLUMN "tarifa_paquete" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "repartidores" ALTER COLUMN "tarifa_paquete" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "precio_paquete" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "registros_dia" ADD COLUMN "entregados" integer;--> statement-breakpoint
ALTER TABLE "registros_dia" ADD COLUMN "incidencias" integer;