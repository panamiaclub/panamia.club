export const getBrevoConfig = () => {
    if (process.env.BREVO_ENV == "DEV") {
        return {
            "templates": {
                "profile": {
                    "submitted": 0,
                    "published": 0,
                    "not_published": 0,
                    "incomplete_reminder": 0,
                },
                "user": {
                    "followed_updates": 0,
                },
                "affiliate": {
                    "intro": 0,
                    "summary": 0,
                },
                "membership": {
                    "confirmation": 0,
                },
                "donations": {
                    "receipt": 0,
                },
                "campaigns": {
                    "existing_panas_import": 0,
                },
                "admin": {
                    "contact_us_submission": 0,
                    "newsletter_submission": 0,
                    "profile_submission": 3,
                    "donation_submission": 0,
                }
            },
            "lists": {
                "added_by_website": 4,
                "user": 0,
                "profiles": 0,
                "affiliates": 0,
                "donors": 0,
                "donor_members": 0,
            }
        }
    }
    return {
        "templates": {
            "profile": {
                "submitted": 29,
                "published": 6,
                "not_published": 17,
                "incomplete_reminder": 0,
            },
            "user": {
                "followed_updates": 0,
            },
            "affiliate": {
                "intro": 0,
                "summary": 0,
            },
            "membership": {
                "confirmation": 0,
            },
            "donations": {
                "receipt": 0,
            },
            "campaigns": {
                "existing_panas_import": 0,
            },
            "admin": {
                "contact_us_submission": 8,
                "newsletter_submission": 7,
                "profile_submission": 39,
                "donation_submission": 0,
            }
        },
        "lists": {
            "added_by_website": 4,
            "user": 0,
            "profiles": 0,
            "affiliates": 0,
            "donors": 0,
            "donor_members": 0,
        }
    }
}