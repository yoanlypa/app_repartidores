CREATE TABLE "ajustes" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"repartidor_id" integer NOT NULL,
	"mes" text NOT NULL,
	"concepto" text NOT NULL,
	"importe" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"nombre_dueno_whatsapp" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"usuario_id" integer,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"archivos" jsonb NOT NULL,
	"datos_pendientes" jsonb,
	"resultado" jsonb,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensajes" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"repartidor_id" integer NOT NULL,
	"fecha_hora" text NOT NULL,
	"texto" text NOT NULL,
	"huella" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meses" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"mes" text NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registros_dia" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"repartidor_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"salida" integer,
	"vuelta" integer,
	"estado" text DEFAULT 'ok' NOT NULL,
	"nota_ia" text,
	"mensaje_original" text,
	"editado_manual" boolean DEFAULT false NOT NULL,
	"revisado" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repartidores" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"alias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tipo_tarifa" text DEFAULT 'por_paquete' NOT NULL,
	"tarifa_paquete" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tarifa_dia" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fijo_mensual" numeric(10, 2) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" text DEFAULT 'empresa' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_repartidor_id_repartidores_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."repartidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_repartidor_id_repartidores_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."repartidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meses" ADD CONSTRAINT "meses_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_dia" ADD CONSTRAINT "registros_dia_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_dia" ADD CONSTRAINT "registros_dia_repartidor_id_repartidores_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."repartidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repartidores" ADD CONSTRAINT "repartidores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mensajes_huella_idx" ON "mensajes" USING btree ("repartidor_id","huella");--> statement-breakpoint
CREATE INDEX "mensajes_mes_idx" ON "mensajes" USING btree ("empresa_id","fecha_hora");--> statement-breakpoint
CREATE UNIQUE INDEX "meses_empresa_mes_idx" ON "meses" USING btree ("empresa_id","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "registros_repartidor_fecha_idx" ON "registros_dia" USING btree ("repartidor_id","fecha");--> statement-breakpoint
CREATE INDEX "repartidores_empresa_idx" ON "repartidores" USING btree ("empresa_id");