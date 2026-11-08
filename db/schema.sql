CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Audits" (
        "Id" uuid NOT NULL,
        "ShopId" uuid,
        "UserId" uuid NOT NULL,
        "Action" character varying(500) NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Audits" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "OtpChallenges" (
        "Id" uuid NOT NULL,
        "Phone" character varying(500) NOT NULL,
        "CodeHash" character varying(500) NOT NULL,
        "Attempts" integer NOT NULL,
        "Used" boolean NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "ExpiresAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_OtpChallenges" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Plans" (
        "Id" uuid NOT NULL,
        "Name" character varying(500) NOT NULL,
        "PriceCents" bigint NOT NULL,
        "Months" integer NOT NULL,
        "Devices" integer NOT NULL,
        "Active" boolean NOT NULL,
        CONSTRAINT "PK_Plans" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "PlatformSettings" (
        "Id" uuid NOT NULL,
        "Name" character varying(500) NOT NULL,
        "Phone" character varying(500) NOT NULL,
        "Email" character varying(500) NOT NULL,
        "GraceDays" integer NOT NULL,
        CONSTRAINT "PK_PlatformSettings" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Shops" (
        "Id" uuid NOT NULL,
        "Name" character varying(500) NOT NULL,
        "Owner" character varying(500) NOT NULL,
        "Phone" character varying(500) NOT NULL,
        "Address" character varying(500) NOT NULL,
        "ReceiptNote" character varying(500) NOT NULL,
        "PlanId" uuid NOT NULL,
        "ExpiresOn" date NOT NULL,
        "Suspended" boolean NOT NULL,
        "SuspensionReason" character varying(500) NOT NULL,
        "Revision" bigint NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Shops" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_Shops_Plans_PlanId" FOREIGN KEY ("PlanId") REFERENCES "Plans" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "CashChecks" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "ExpectedCents" bigint NOT NULL,
        "ActualCents" bigint NOT NULL,
        "DifferenceCents" bigint NOT NULL,
        "Revision" bigint NOT NULL,
        "Note" character varying(500) NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_CashChecks" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_CashChecks_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "CashEntries" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "ReferenceId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "AmountCents" bigint NOT NULL,
        "Kind" character varying(500) NOT NULL,
        "Description" character varying(500) NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_CashEntries" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_CashEntries_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "CommandRecords" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "Key" character varying(128) NOT NULL,
        "Operation" character varying(500) NOT NULL,
        "RequestHash" character varying(500) NOT NULL,
        "ResponseJson" jsonb NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_CommandRecords" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_CommandRecords_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Expenses" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "Number" character varying(500) NOT NULL,
        "Description" character varying(500) NOT NULL,
        "Category" character varying(500) NOT NULL,
        "AmountCents" bigint NOT NULL,
        "Date" date NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "Cancelled" boolean NOT NULL,
        "CancellationReason" character varying(500) NOT NULL,
        "CancelledAt" timestamp with time zone,
        CONSTRAINT "PK_Expenses" PRIMARY KEY ("Id"),
        CONSTRAINT "CK_Expense_Amount" CHECK ("AmountCents" > 0),
        CONSTRAINT "FK_Expenses_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Parties" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "Kind" character varying(500) NOT NULL,
        "Name" character varying(500) NOT NULL,
        "Phone" character varying(500) NOT NULL,
        CONSTRAINT "PK_Parties" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_Parties_ShopId_Id" UNIQUE ("ShopId", "Id"),
        CONSTRAINT "CK_Party_Kind" CHECK ("Kind" IN ('customer','supplier')),
        CONSTRAINT "FK_Parties_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Products" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "Name" character varying(500) NOT NULL,
        "Barcode" character varying(500) NOT NULL,
        "Category" character varying(500) NOT NULL,
        "Unit" character varying(500) NOT NULL,
        "SalePriceCents" bigint NOT NULL,
        "Stock" numeric(18,3) NOT NULL,
        "AverageCostCents" numeric(20,6) NOT NULL,
        "Minimum" numeric(18,3) NOT NULL,
        "CartonSize" integer NOT NULL,
        "Archived" boolean NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_Products" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_Products_ShopId_Id" UNIQUE ("ShopId", "Id"),
        CONSTRAINT "CK_Product_Amounts" CHECK ("SalePriceCents" >= 0 AND "Minimum" >= 0 AND "CartonSize" > 0 AND "AverageCostCents" >= 0),
        CONSTRAINT "FK_Products_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "SubscriptionPayments" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "AmountCents" bigint NOT NULL,
        "Reference" character varying(500) NOT NULL,
        "PreviousExpiry" date NOT NULL,
        "ExpiresOn" date NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_SubscriptionPayments" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_SubscriptionPayments_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Tickets" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "Subject" character varying(500) NOT NULL,
        "Message" character varying(4000) NOT NULL,
        "Status" character varying(500) NOT NULL,
        "Reply" character varying(4000) NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Tickets" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_Tickets_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Users" (
        "Id" uuid NOT NULL,
        "ShopId" uuid,
        "Name" character varying(500) NOT NULL,
        "Phone" character varying(500) NOT NULL,
        "Email" character varying(500) NOT NULL,
        "PasswordHash" character varying(1000) NOT NULL,
        "Role" character varying(500) NOT NULL,
        "Active" boolean NOT NULL,
        CONSTRAINT "PK_Users" PRIMARY KEY ("Id"),
        CONSTRAINT "CK_User_Scope" CHECK (("ShopId" IS NULL AND "Role" IN ('PlatformAdmin','Support','Billing')) OR ("ShopId" IS NOT NULL AND "Role" IN ('Owner','Cashier','Warehouse','Accountant'))),
        CONSTRAINT "FK_Users_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "Invoices" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "PartyId" uuid,
        "PartyName" character varying(500) NOT NULL,
        "Kind" character varying(500) NOT NULL,
        "Number" character varying(500) NOT NULL,
        "Date" date NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "LinesJson" jsonb NOT NULL,
        "SubtotalCents" bigint NOT NULL,
        "DiscountCents" bigint NOT NULL,
        "TotalCents" bigint NOT NULL,
        "PaidCents" bigint NOT NULL,
        "OutstandingCents" bigint NOT NULL,
        "ChangeCents" bigint NOT NULL,
        "CostCents" bigint NOT NULL,
        "Method" character varying(500) NOT NULL,
        "Notes" character varying(500) NOT NULL,
        CONSTRAINT "PK_Invoices" PRIMARY KEY ("Id"),
        CONSTRAINT "CK_Invoice_Amounts" CHECK ("SubtotalCents" >= 0 AND "DiscountCents" >= 0 AND "TotalCents" = "SubtotalCents" - "DiscountCents" AND "PaidCents" >= 0 AND "OutstandingCents" >= 0 AND "TotalCents" = "PaidCents" + "OutstandingCents"),
        CONSTRAINT "FK_Invoices_Parties_PartyId" FOREIGN KEY ("PartyId") REFERENCES "Parties" ("Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_Invoices_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "PartyEntries" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "PartyId" uuid NOT NULL,
        "ReferenceId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "AmountCents" bigint NOT NULL,
        "Kind" character varying(500) NOT NULL,
        "Note" character varying(500) NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_PartyEntries" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_PartyEntries_Parties_ShopId_PartyId" FOREIGN KEY ("ShopId", "PartyId") REFERENCES "Parties" ("ShopId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_PartyEntries_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "StockMovements" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "ProductId" uuid NOT NULL,
        "ReferenceId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "Kind" character varying(500) NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "BalanceAfter" numeric(20,6) NOT NULL,
        "UnitCostCents" numeric(20,6) NOT NULL,
        "Reason" character varying(500) NOT NULL,
        "Date" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_StockMovements" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_StockMovements_Products_ShopId_ProductId" FOREIGN KEY ("ShopId", "ProductId") REFERENCES "Products" ("ShopId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_StockMovements_Shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "Shops" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE TABLE "LoginSessions" (
        "Id" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "DeviceName" character varying(500) NOT NULL,
        "Active" boolean NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "LastSeen" timestamp with time zone NOT NULL,
        "ExpiresAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_LoginSessions" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_LoginSessions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Audits_ShopId" ON "Audits" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_CashChecks_ShopId" ON "CashChecks" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_CashEntries_ShopId" ON "CashEntries" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_CommandRecords_ShopId_Key" ON "CommandRecords" ("ShopId", "Key");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Expenses_ShopId" ON "Expenses" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_Expenses_ShopId_Number" ON "Expenses" ("ShopId", "Number");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Invoices_PartyId" ON "Invoices" ("PartyId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Invoices_ShopId" ON "Invoices" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_Invoices_ShopId_Number" ON "Invoices" ("ShopId", "Number");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_LoginSessions_UserId_Active" ON "LoginSessions" ("UserId", "Active");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_OtpChallenges_Phone_CreatedAt" ON "OtpChallenges" ("Phone", "CreatedAt");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_Parties_ShopId_Kind_Name" ON "Parties" ("ShopId", "Kind", "Name");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_PartyEntries_ShopId" ON "PartyEntries" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_PartyEntries_ShopId_PartyId" ON "PartyEntries" ("ShopId", "PartyId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_Products_ShopId_Barcode" ON "Products" ("ShopId", "Barcode") WHERE "Barcode" <> '';
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Shops_PlanId" ON "Shops" ("PlanId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_StockMovements_ShopId" ON "StockMovements" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_StockMovements_ShopId_ProductId" ON "StockMovements" ("ShopId", "ProductId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_SubscriptionPayments_ShopId" ON "SubscriptionPayments" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Tickets_ShopId" ON "Tickets" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_Users_Email" ON "Users" ("Email") WHERE "Email" <> '';
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE UNIQUE INDEX "IX_Users_Phone" ON "Users" ("Phone");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    CREATE INDEX "IX_Users_ShopId" ON "Users" ("ShopId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111050_InitialCreate') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261020111050_InitialCreate', '10.0.13');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111722_TrackCostCompleteness') THEN
    ALTER TABLE "Products" ADD "CostKnown" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111722_TrackCostCompleteness') THEN
    ALTER TABLE "Invoices" ADD "CostComplete" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111722_TrackCostCompleteness') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261020111722_TrackCostCompleteness', '10.0.13');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111940_CancellationAndAdjustmentDates') THEN
    ALTER TABLE "StockMovements" ADD "BusinessDate" date NOT NULL DEFAULT DATE '-infinity';
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111940_CancellationAndAdjustmentDates') THEN
    ALTER TABLE "StockMovements" ADD "CostKnown" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111940_CancellationAndAdjustmentDates') THEN
    ALTER TABLE "Expenses" ADD "ReversalDate" date;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261020111940_CancellationAndAdjustmentDates') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261020111940_CancellationAndAdjustmentDates', '10.0.13');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261022102347_InvoiceReturns') THEN
    ALTER TABLE "Invoices" ADD CONSTRAINT "AK_Invoices_ShopId_Id" UNIQUE ("ShopId", "Id");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261022102347_InvoiceReturns') THEN
    CREATE TABLE "InvoiceReturns" (
        "Id" uuid NOT NULL,
        "ShopId" uuid NOT NULL,
        "InvoiceId" uuid NOT NULL,
        "UserId" uuid NOT NULL,
        "Number" character varying(500) NOT NULL,
        "Kind" character varying(500) NOT NULL,
        "Date" date NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "LinesJson" jsonb NOT NULL,
        "TotalCents" bigint NOT NULL,
        "DebtReductionCents" bigint NOT NULL,
        "CashCents" bigint NOT NULL,
        "CardCents" bigint NOT NULL,
        "CostCents" bigint NOT NULL,
        "CostComplete" boolean NOT NULL,
        "RefundMethod" character varying(500) NOT NULL,
        "Reason" character varying(500) NOT NULL,
        CONSTRAINT "PK_InvoiceReturns" PRIMARY KEY ("Id"),
        CONSTRAINT "CK_InvoiceReturn_Amounts" CHECK ("TotalCents" >= 0 AND "DebtReductionCents" >= 0 AND "CashCents" >= 0 AND "CardCents" >= 0 AND "CostCents" >= 0 AND "TotalCents" = "DebtReductionCents" + "CashCents" + "CardCents" AND "Kind" IN ('sale.return','purchase.return') AND "RefundMethod" IN ('cash','card')),
        CONSTRAINT "FK_InvoiceReturns_Invoices_ShopId_InvoiceId" FOREIGN KEY ("ShopId", "InvoiceId") REFERENCES "Invoices" ("ShopId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_InvoiceReturns_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261022102347_InvoiceReturns') THEN
    CREATE INDEX "IX_InvoiceReturns_ShopId_InvoiceId" ON "InvoiceReturns" ("ShopId", "InvoiceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261022102347_InvoiceReturns') THEN
    CREATE UNIQUE INDEX "IX_InvoiceReturns_ShopId_Number" ON "InvoiceReturns" ("ShopId", "Number");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261022102347_InvoiceReturns') THEN
    CREATE INDEX "IX_InvoiceReturns_UserId" ON "InvoiceReturns" ("UserId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261022102347_InvoiceReturns') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261022102347_InvoiceReturns', '10.0.13');
    END IF;
END $EF$;
COMMIT;

