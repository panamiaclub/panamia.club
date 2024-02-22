// Atlas Search Docs: https://www.mongodb.com/docs/atlas/atlas-search/text/#text
import dbConnect from "pages/api/auth/lib/connectdb";
import profile from "pages/api/auth/lib/model/profile";
import { AdminSearchInterface } from "../query/admin";
import { dateXdays } from "../standardized";

const mileInMeters = 1609.344;

const getPivotValue = () => {
    // PIVOT Calculation: score = pivot / (pivot + distance);
    return mileInMeters * 50;
}

export const getAdminSearch = async ({ pageNum, pageLimit, searchTerm }: AdminSearchInterface) => {

    console.log("getAdminSearch");
    await dbConnect();

    if (searchTerm) {
        const offset = (pageLimit * pageNum) - pageLimit;
        const skip = pageNum > 1 ? ((pageNum - 1) * pageLimit) : 0;
        // console.log("skip", skip);
        const aggregateQuery = [
            {
                '$search': {
                    'index': 'profiles-search',
                    'compound': {
                        'should': [
                            {
                                'text': {
                                    'query': searchTerm,
                                    'path': ['name', 'email'],
                                    'fuzzy': {
                                        'maxEdits': 1,
                                        'maxExpansions': 5,
                                    },
                                    'score': {
                                        'boost': {
                                            'value': 5
                                        }
                                    }
                                }
                            }
                        ],
                        "minimumShouldMatch": 1
                    },
                    "count": {
                        "type": "total"
                    },
                }
            }, {
                '$skip': skip
            }, {
                '$limit': pageLimit
            }, {
                '$project': {
                    'name': 1,
                    'slug': 1,
                    'socials': 1,
                    'five_words': 1,
                    'details': 1,
                    'images.primaryCDN': 1,
                    'primary_address.city': 1,
                    'geo': 1,
                    'score': { '$meta': 'searchScore' },
                    "paginationToken": { "$meta": "searchSequenceToken" },
                    "meta": "$$SEARCH_META",
                }
            }
        ];
        // console.log(aggregateQuery[0]);
        const aggregateList = await profile.aggregate(aggregateQuery);
        if (aggregateList) {
            // console.log(aggregateList);
            return { success: true, data: aggregateList }
        }
        return { success: true, data: [] }
    }
}


export const getAdminDashboard = async () => {
    await dbConnect();
    const profilesFilters = {
        active: true,
        createdAt: {"$gte": dateXdays(30)}
    }
    const profilesFields = {
        name: 1,
        slug: 1,
        active: 1,
        createdAt: 1,
    }
    const recentProfiles = await profile.find(profilesFilters).sort({ $natural: -1 });
    const allProfiles = await profile.find({active: true}).count();
    return { recent: recentProfiles, all: allProfiles };
}