import { integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

export const developer =  pgTable('developers',{
    id : uuid('id').defaultRandom().primaryKey(),
    name : text('name').notNull(),
    email : text('email').notNull().unique(),
    password : text('password').notNull(),
    createdAt : timestamp('createdAt').defaultNow(),
    updatedAt : timestamp('updatedAt').defaultNow()
})

export const verifyEmailCode =  pgTable('verifyEmailCode',{
    email : text('email').notNull().unique(),
    code : integer('code').notNull(),
    createdAt : timestamp('createdAt').defaultNow()
})