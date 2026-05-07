import { MigrationInterface, QueryRunner } from 'typeorm';

// Schema inicial. Generada con migration:generate contra BD limpia.
// En dev synchronize:true; en prod migrationsRun:true aplica esto al arrancar.
// CREATE EXTENSION uuid-ossp se agrego a mano: migration:generate no lo emite,
// pero uuid_generate_v4() lo necesita. IF NOT EXISTS lo hace idempotente.
export class Init1778339235976 implements MigrationInterface {
  name = 'Init1778339235976';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TYPE "public"."users_rol_enum" AS ENUM('dueno', 'empleado')`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password" character varying(255) NOT NULL, "nombre" character varying(100) NOT NULL, "rol" "public"."users_rol_enum" NOT NULL DEFAULT 'empleado', "comercioNombre" character varying(150) NOT NULL, "activo" boolean NOT NULL DEFAULT true, "refreshToken" character varying(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ean13" character varying(13) NOT NULL, "nombre" character varying(200) NOT NULL, "descripcion" text, "categoria" character varying(100), "precioCompra" numeric(10,2), "precioVenta" numeric(10,2), "unidadMedida" character varying(20) NOT NULL DEFAULT 'unidad', "stockMinimo" integer NOT NULL DEFAULT '5', "imagenUrl" character varying(500), "activo" boolean NOT NULL DEFAULT true, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2233808b14c5b73c8ca84de3949" UNIQUE ("ean13", "userId"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_99d90c2a483d79f3b627fb1d5e" ON "products" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."stock_movements_tipo_enum" AS ENUM('entrada', 'salida', 'ajuste')`,
    );
    await queryRunner.query(
      `CREATE TABLE "stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tipo" "public"."stock_movements_tipo_enum" NOT NULL, "cantidad" integer NOT NULL, "motivo" character varying(50), "nota" character varying(500), "productId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4fc9f6fc2db22fc301f7c1c918" ON "stock_movements" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fe8f81647152d8bfb9c7c4e490" ON "stock_movements" ("productId", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_99d90c2a483d79f3b627fb1d5e9" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_a3acb59db67e977be45e382fc56" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_4fc9f6fc2db22fc301f7c1c918b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_4fc9f6fc2db22fc301f7c1c918b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_a3acb59db67e977be45e382fc56"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_99d90c2a483d79f3b627fb1d5e9"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_fe8f81647152d8bfb9c7c4e490"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4fc9f6fc2db22fc301f7c1c918"`);
    await queryRunner.query(`DROP TABLE "stock_movements"`);
    await queryRunner.query(`DROP TYPE "public"."stock_movements_tipo_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_99d90c2a483d79f3b627fb1d5e"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_rol_enum"`);
  }
}
