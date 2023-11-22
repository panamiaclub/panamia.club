export interface PronounsInterface {
    sheher?: Boolean,
    hehim?: Boolean,
    theythem?: Boolean,
    none?: Boolean,
    other?: Boolean,
    other_desc?: String,
}

export interface ProfileStatusInterface {
    submitted?: Date,
    approved?: Date,
    published?: Date,
    notes?: String,
}

export interface ProfileSocialsInterface {
    website: String,
    instagram?: String,
    facebook?: String,
    tiktok?: String,
    twitter?: String,
    spotify?: String,
}

export interface AddressInterface {
    name: String,
    street1?: String,
    street2?: String,
    city?: String,
    state?: String,
    zipcode?: String,
    hours?: String,
    lat?: String,
    lng?: String,
    google_place_id?: String,
}

export interface CountyInterface {
    palm_beach: Boolean,
    broward: Boolean,
    miami_dade: Boolean,
}

export interface CategoryInterface {
    products: Boolean,
    services: Boolean,
    events: Boolean,
    music: Boolean,
    food: Boolean,
    clothing: Boolean,
    accessories: Boolean,
    art: Boolean,
    digital_art: Boolean,
    tech: Boolean,
    health_beauty: Boolean,
    spiritual: Boolean,
    non_profit: Boolean,
    homemade: Boolean,
}

export interface ProfileInterface {
    email: String,
    name: String,
    slug: String,
    active?: Boolean,
    status?: ProfileStatusInterface,
    locally_based: String,
    details: String,
    background?: String,
    socials: ProfileSocialsInterface,
    phone_number: String,
    whatsapp_community?: Boolean,
    pronouns?: PronounsInterface,
    five_words: String,
    tags?: String,
    counties: CountyInterface,
    categories: CategoryInterface,
    primary_address: AddressInterface,
    locations: [],
    images?: {},
    linked_profiles: [],
}

export interface ContactUsInterface {
    _id: String,
    name: String,
    email: String,
    message: String,
    acknowledged: Boolean,
    createdAt: Date,
    updatedAt: Date,
}

export interface SignupInterface {
    _id: String,
    email: String,
    name: String,
    signupType: String,
    acknowledged: Boolean,
    createdAt: Date,
    updatedAt: Date,
}

export interface UserStatusInterface {
    role?: String,
    locked?: Boolean,
}

export interface UserInterface {
    _id: String,
    email: String,
    name?: String,
    status?: UserStatusInterface,
    alternate_emails?: [],
    createdAt: Date,
    updatedAt: Date,
}

export interface Pagination {
    count: number,
    per_page: number,
    offset: number,
    page_number: number,
    total_pages: number,
  }