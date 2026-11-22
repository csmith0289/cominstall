import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// An Admin's offer of an account to an email address. Only an invited email (or one in ADMIN_EMAILS) can sign up.
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    // Stored lower case, as typed otherwise.
    email: text("email").notNull(),
    role: text("role", { enum: ["engineer", "admin"] }).notNull().default("engineer"),
    // A random token, sent in the invitation link. Only its SHA-256 hash is stored.
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("invitations_email_idx").on(table.email)],
);

export const customers = pgTable("customers", {
  id: id(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    // Normalised: upper case, no spaces or dashes (src/vehicles/reg.ts).
    reg: text("reg").notNull(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    make: text("make"),
    model: text("model"),
    vin: text("vin"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("vehicles_reg_unique").on(table.reg),
    check("vehicles_reg_normalised", sql`${table.reg} ~ '^[A-Z0-9]+$'`),
  ],
);

export const JOB_CARD_STATUSES = ["draft", "outstanding", "complete"] as const;
export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

export const jobCards = pgTable(
  "job_cards",
  {
    id: id(),
    // The Engineer the Job Card belongs to.
    engineerId: text("engineer_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // Null while a Draft has no Reg yet.
    vehicleId: text("vehicle_id").references(() => vehicles.id, { onDelete: "restrict" }),
    // The Vehicle's Customer when the job was done, so a Vehicle changing hands doesn't rewrite history.
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    jobDate: text("job_date").notNull(), // ISO date, yyyy-mm-dd
    mileage: integer("mileage"),
    workCarriedOut: text("work_carried_out").notNull().default(""),
    status: text("status", { enum: JOB_CARD_STATUSES }).notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("job_cards_engineer_status_idx").on(table.engineerId, table.status),
    index("job_cards_vehicle_idx").on(table.vehicleId),
    index("job_cards_customer_idx").on(table.customerId),
    check("job_cards_mileage_non_negative", sql`${table.mileage} is null or ${table.mileage} >= 0`),
  ],
);

export const jobCardParts = pgTable(
  "job_card_parts",
  {
    id: id(),
    jobCardId: text("job_card_id")
      .notNull()
      .references(() => jobCards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    quantity: text("quantity").notNull().default(""),
    part: text("part").notNull().default(""),
    partNumberOrNotes: text("part_number_or_notes").notNull().default(""),
  },
  (table) => [uniqueIndex("job_card_parts_position_unique").on(table.jobCardId, table.position)],
);

export type AuditDetail = Record<string, unknown>;

// Append-only: who changed what, and when. Rows are never updated or deleted.
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    // Null once the acting account is gone.
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    // True when the actor acted as the Operator (OPERATOR_EMAILS), not as a User.
    asOperator: boolean("as_operator").notNull().default(false),
    kind: text("kind").notNull(),
    jobCardId: text("job_card_id").references(() => jobCards.id, { onDelete: "set null" }),
    subjectUserId: text("subject_user_id").references(() => user.id, { onDelete: "set null" }),
    detail: jsonb("detail").$type<AuditDetail>().notNull().default({}),
  },
  (table) => [index("audit_log_at_idx").on(table.at), index("audit_log_job_card_idx").on(table.jobCardId)],
);
