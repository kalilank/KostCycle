import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  authErrorMessage,
  isStudentEmail,
  normaliseEmail,
  studentEmailError,
} from "../src/utils/studentEmail.js";

test("only exact @binus.ac.id addresses count as student emails", () => {
  for (const ok of [
    "nathanael.s@binus.ac.id",
    "  Student.Name@BINUS.AC.ID ",
    "a+tag@binus.ac.id",
  ])
    assert.equal(isStudentEmail(ok), true, ok);
  for (const bad of [
    "",
    null,
    "student@gmail.com",
    "student@binus.edu",
    "student@mail.binus.ac.id",
    "student@notbinus.ac.id",
    "student@binus.ac.id.evil.com",
    "@binus.ac.id",
    "a@b@binus.ac.id",
    "stu dent@binus.ac.id",
  ])
    assert.equal(isStudentEmail(bad), false, String(bad));
  assert.equal(normaliseEmail("  A@Binus.AC.id "), "a@binus.ac.id");
  assert.equal(studentEmailError("x@binus.ac.id"), "");
  assert.match(studentEmailError("x@gmail.com"), /@binus\.ac\.id/);
});

test("auth errors map to student-facing messages", () => {
  assert.match(
    authErrorMessage({ message: "Database error saving new user" }),
    /BINUS student email/,
  );
  assert.match(
    authErrorMessage({ code: "email_not_confirmed", message: "x" }),
    /Confirm your email/,
  );
  assert.equal(
    authErrorMessage({ message: "Invalid login credentials" }),
    "Invalid login credentials",
  );
});

test("migration: auth.users rejects non-BINUS sign-ups and email changes, exempts seed accounts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;
      create table auth.users(id uuid primary key default gen_random_uuid(), email text,
        raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
      insert into auth.users(email) values ('legacy@gmail.com');`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610260001_binus_student_email.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const insert = (email, app = {}) =>
      db.query(
        "insert into auth.users(email, raw_app_meta_data) values ($1,$2) returning id",
        [email, app],
      );
    const { rows } = await insert("Student@BINUS.ac.id");
    for (const bad of [
      "student@gmail.com",
      "student@mail.binus.ac.id",
      "student@notbinus.ac.id",
      null,
    ])
      await assert.rejects(insert(bad), /binus_email_required/, String(bad));
    // Changing to an outside address is blocked; other updates are not.
    await assert.rejects(
      db.query("update auth.users set email='x@gmail.com' where id=$1", [
        rows[0].id,
      ]),
      /binus_email_required/,
    );
    await db.query(
      "update auth.users set raw_user_meta_data='{\"name\":\"A\"}' where id=$1",
      [rows[0].id],
    );
    // Pre-existing accounts keep working.
    await db.query(
      "update auth.users set raw_user_meta_data='{}' where email='legacy@gmail.com'",
    );
    // Only the trusted seed namespace (service-role app_metadata) is exempt.
    await insert("kostcycle-demo-v1-01@example.invalid", {
      seed_namespace: "kostcycle-demo-v1",
    });
    await assert.rejects(
      insert("x@example.invalid", { seed_namespace: "other" }),
      /binus_email_required/,
    );
  } finally {
    await db.close();
  }
});
