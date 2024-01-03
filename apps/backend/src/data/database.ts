import { Profile } from "features/profiling/ProfilePresets";
import { pgTable, uuid, varchar, json } from "drizzle-orm/pg-core";
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import { and, eq } from "drizzle-orm";
import { createJwt } from "./authentication";

type Database = PostgresJsDatabase<Record<string, any>>;

const profileTable = pgTable('profiles', {
    uuid: uuid('uuid').primaryKey(),
    username: varchar('username'),
    number: varchar('number'),
    bio: varchar('bio'),
    photo: varchar('photo'),
    password: varchar('password'),
    contacts: json('contacts')
});

type ProfileWithContacts = Profile & { contacts?: Profile[] }

const getProfileWithContacts = async (uuid: string, db: Database, isContactProfile = false): Promise<ProfileWithContacts> => {
    const validUUID = await z.string().uuid().parseAsync(uuid);

    const profile = (await db
        .select({ 
            username: profileTable.username,
            number: profileTable.number,
            bio: profileTable.bio,
            photo: profileTable.photo,
            contacts: profileTable.contacts
        })
        .from(profileTable)
        .where(eq(profileTable.uuid, validUUID))
        .limit(1))[0] as Profile;

    if (isContactProfile) {
        return { ...profile, contacts: [] };
    }

    const contactPromises = profile.contacts.map(uuid => getProfileWithContacts(uuid, db, true));
    const contacts = await Promise.all(contactPromises) as Profile[];

    return { ...profile, contacts } as ProfileWithContacts;
}

const createProfile = async (profile: Profile, password: string, db: Database) => {
    const validProfile = await Profile.parseAsync(profile);
    const insertionProfile = {...validProfile, contacts: validProfile.contacts };

    await db
        .insert(profileTable)
        .values({
            uuid: insertionProfile.uuid,
            username: insertionProfile.username,
            number: insertionProfile.number,
            bio: insertionProfile.bio,
            photo: insertionProfile.photo,
            password: password,
            contacts: insertionProfile.contacts
        });
    
    return validProfile;
}

const authenticate = async (number: string, password: string, db: Database) => {
    const validNumber = await z.string().max(16).regex(/^\d+$/).parseAsync(number);
    const validPassword = await z.string().max(360).parseAsync(password);

    const match = await db
        .select({ uuid: profileTable.uuid })
        .from(profileTable)
        .where(and(
            eq(profileTable.number, validNumber), 
            eq(profileTable.password, validPassword)
        ));

    if (!match) {
        throw new Error('Invalid credentials or non-existent user');
    }

    const profile = await getProfileWithContacts(match[0].uuid, db);
    const tokens = await createJwt(profile);

    return tokens;
}

export { 
    Database, 
    getProfileWithContacts, 
    createProfile, 
    authenticate 
}