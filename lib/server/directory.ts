// Atlas Search Docs: https://www.mongodb.com/docs/atlas/atlas-search/text/#text
import dbConnect from "pages/api/auth/lib/connectdb";
import profile from "pages/api/auth/lib/model/profile";

interface SearchInterface {
    pageNum: number,
    pageLimit: number,
    searchTerm: string,
    filterLocations: string,
    filterCategories: string,
    random: boolean,
    geolat: string,
    geolng: string,
    resultsView: string,
}

const mileInMeters = 1609.344;

const getPivotValue = () => {
  // PIVOT Calculation: score = pivot / (pivot + distance);
  return mileInMeters * 50;
}

export const getSearch = async ({ pageNum, pageLimit, searchTerm, 
    filterLocations, filterCategories, random, geolat, geolng, resultsView}: SearchInterface) => {
      const view = resultsView ? resultsView : "list";
    
    console.log("getSearch");
    await dbConnect();
    console.log("geolat", geolat);
    console.log("geolng", geolng);
    // DOCS: https://www.mongodb.com/docs/manual/geospatial-queries/#std-label-geospatial-geojson
    let geoFilter = {};
    if (geolat && geolng) {
      const lat = parseFloat(geolat);
      const lng = parseFloat(geolng);
      if (view == "map") {
        // DOCS: https://www.mongodb.com/docs/atlas/atlas-search/geoWithin/#syntax
        geoFilter = {
          "geoWithin": {
            "circle": {
              "center": {
                "type": "Point",
                "coordinates": [ lng, lat ]
              },
              "radius": 1610 * 25, // metersinmile x miles
            },
            "path": "geo"
          }
        }
      }
      if (view == "list") {
        // DOCS: https://www.mongodb.com/docs/atlas/atlas-search/near/#syntax
        geoFilter = {
          "near": {
            "origin": { type: 'Point', coordinates: [ lng, lat ] },
            "pivot": getPivotValue(),
            "path": "geo",
            'score': {
              'boost': {
                'value': 10
              }
            }
          }
        }
      }
    }
    // console.log("geoFilter", geoFilter)

    if (random) {
        const randomList = await profile.aggregate([{ '$sample': { 'size': pageLimit } }]);
        return {
          success: true,
          data: randomList,
          pagination: {},
          msg: "No Search Term",
        };
    }
    
    if (searchTerm) {
      const offset = (pageLimit * pageNum) - pageLimit;
  
      //const listCount = await profile.count();
      //const pagination = {
      //  count: listCount,
      //  per_page: pageLimit,
      //  offset: offset,
      //  page_number: pageNum,
      //  total_pages: (listCount > 0 ? Math.ceil(listCount / pageLimit) : 1),
      //}
      let locsFilter = {};
      if (filterLocations) {
        const locs = filterLocations.split("+");
        let locsPaths: string[] = [];
        locs.forEach((value) => {
            locsPaths.push(`counties.${value}`);
        });
        if (locsPaths.length > 999) {
            locsFilter = {
                'equals': {
                    'path': locsPaths,
                    'equals': true,
                }
            }
        }
      }

      let catsFilter = {};
      if (filterCategories) {
        const locs = filterCategories.split("+");
        let catsPaths: string[] = [];
        locs.forEach((value) => {
            catsPaths.push(`categories.${value}`);
        });
        if (catsPaths.length > 999) {
            catsFilter = {
                'equals': {
                    'path': catsPaths,
                    'equals': true,
                }
            }
        }
      }

      // TODO: Filter by ACTIVE Profiles
      const aggregateQuery = [
        {
          '$search': {
            'index': 'profiles-search', 
            'compound': {
              'should': [
                ...(Object.keys(locsFilter).length !== 0 ? [locsFilter] : []),
                ...(Object.keys(catsFilter).length !== 0 ? [catsFilter] : []),
                {
                  'text': {
                    'query': searchTerm, 
                    'path': 'name',
                    'fuzzy': {
                      'maxEdits': 1,
                      'maxExpansions': 20,
                    },
                    'score': {
                      'boost': {
                        'value': 5
                      }
                    }
                  }
                }, {
                  'text': {
                    'query': searchTerm, 
                    'path': ['five_words','tags'], 
                    'score': {
                      'boost': {
                        'value': 3
                      }
                    }
                  }
                }, {
                  'text': {
                    'query': searchTerm, 
                    'path': [
                      'details', 'background'
                    ]
                  }
                },
                ...(Object.keys(geoFilter).length !== 0 ? [geoFilter] : []),
              ]
            },
          }
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
            'score': {'$meta': 'searchScore'},
          }
        }
        ];

        //DOCS: https://www.mongodb.com/docs/atlas/atlas-search/score/get-details/#syntax

      console.log(aggregateQuery[0]);
      const aggregateList = await profile.aggregate(aggregateQuery);
      if (aggregateList) {
        // console.log(aggregateList);
        return { success: true, data: aggregateList }
      }
      return { success: true, data: [] }
    }
}