export interface PronounsInterface {
    sheher?: boolean,
    hehim?: boolean,
    theythem?: boolean,
    none?: boolean,
    other?: boolean,
    other_desc?: string,
}

export interface ProfileStatusInterface {
    submitted?: Date,
    approved?: Date,
    published?: Date,
    notes?: String,
}

export interface ProfileSocialsInterface {
    website: string,
    instagram?: string,
    facebook?: string,
    tiktok?: string,
    twitter?: string,
    spotify?: string,
}

export interface AddressInterface {
    name: string,
    street1?: string,
    street2?: string,
    city?: string,
    state?: string,
    zipcode?: string,
    hours?: string,
    lat?: string,
    lng?: string,
    google_place_id?: string,
}

export interface CountyInterface {
    palm_beach: Boolean,
    broward: Boolean,
    miami_dade: Boolean,
}

export interface ProfileImagesInterface {
    primary?: string,
    primaryCDN?: string,
    gallery1?: string,
    gallery1CDN?: string,
    gallery2?: string,
    gallery2CDN?: string,
    gallery3?: string,
    gallery3CDN?: string,
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
    email: string,
    name: string,
    slug: string,
    active?: Boolean,
    status?: ProfileStatusInterface,
    locally_based: string,
    details: string,
    background?: string,
    socials: ProfileSocialsInterface,
    phone_number: string,
    whatsapp_community?: Boolean,
    pronouns?: PronounsInterface,
    five_words: string,
    tags?: string,
    counties: CountyInterface,
    categories: CategoryInterface,
    primary_address: AddressInterface,
    locations: [],
    images?: ProfileImagesInterface,
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