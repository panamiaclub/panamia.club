import dbConnect from "pages/api/auth/lib/connectdb";
import interaction from "pages/api/auth/lib/model/interaction";

const interactionActions = {
    "newsletter_signup" : {
        "points": 0
    },
    "user_signup" : {
        "points": 10
    },
    "profile_signup" : {
        "points": 50
    },
    "donation_onetime" : {
        "points": 100
    },
    "donation_membership" : {
        "points": 100
    },
}

interface SaveInteraction {
    email: String,
    action: "user_signup" | "newsletter_signup" | "profile_signup" |
        "donation_onetime"| "donation_membership",
    affiliate?: String,

}

export const saveInteraction = async ({email, action, affiliate}: SaveInteraction) => {
    const points = interactionActions[action].points;
    await dbConnect();
    const newInteraction = new interaction({
        email: email,
        action: action,
        affiliate: affiliate ? affiliate : null,
        points: points,
    });
    const response = await newInteraction.save();
    if (affiliate) {
        // const update = await calculatePoints(affiliate)
    }
    return response;
}

export const calculatePoints = async (affiliate: String) => {
    await dbConnect();
    const aggregateQuery = [
        {
          '$group': {
            '_id': '$affiliate',
            'totalPoints': { '$sum': '$points' }
          }
        }
    ];
    const pointsSum = await interaction.aggregate(aggregateQuery);
    // points and interactions should eventually by historically tracked to minimize large db calls
    console.log(pointsSum);
    return pointsSum;
}
