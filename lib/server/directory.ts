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
}

export const getSearch = async ({ pageNum, pageLimit, searchTerm, 
    filterLocations, filterCategories, random}: SearchInterface) => {
        console.log("getSearch");
    await dbConnect();

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
                }
              ]
            }
          }
        }, {
          '$project': {
            'name': 1,
            'slug': 1, 
            'socials': 1, 
            'five_words': 1, 
            'details': 1, 
            'primary_address.city': 1,
            'score': {
              '$meta': 'searchScore'
            }
          }
        }, {
          '$limit': pageLimit
        }
        ];

      // console.log(aggregateQuery[0]['$search']['compound']);
      const aggregateList = await profile.aggregate(aggregateQuery);
      if (aggregateList) {
        // console.log(aggregateList);
        return { success: true, data: aggregateList }
      }
      return { success: true, data: [] }
    }
}