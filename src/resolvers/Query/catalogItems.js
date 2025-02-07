import Logger from "@reactioncommerce/logger";
import ReactionError from "@reactioncommerce/reaction-error";
import getPaginatedResponse from "@reactioncommerce/api-utils/graphql/getPaginatedResponse.js";
import wasFieldRequested from "@reactioncommerce/api-utils/graphql/wasFieldRequested.js";
import { decodeShopOpaqueId, decodeTagOpaqueId } from "../../xforms/id.js";
import xformCatalogBooleanFilters from "../../utils/catalogBooleanFilters.js";
import xformCatalogSimpleFilters from "../../utils/catalogSimpleFilters.js";
import { applyPagination, filterByPriceRange, filterBySearchQuery, filterBySimpleFilters, filterByTagIds } from "../../utils/redisDataFilter.js";

/**
 * @name Query/catalogItems
 * @method
 * @memberof Catalog/GraphQL
 * @summary Get a list of catalogItems
 * @param {Object} _ - unused
 * @param {ConnectionArgs} args - an object of all arguments that were sent by the client
 * @param {String[]} [args.searchQuery] - limit to catalog items matching this text search query
 * @param {String[]} [args.shopIds] - limit to catalog items for these shops
 * @param {String[]} [args.tagIds] - limit to catalog items with this array of tags
 * @param {Object[]} [args.booleanFilters] - Array of boolean filter objects with `name` and `value`
 *  * @param {Object[]} [args.simpleFilters] - Array of simple filter objects with `size`, `color`, `minprice`, `maxprice`
 * @param {Object} context - an object containing the per-request state
 * @param {Object} info Info about the GraphQL request
 * @returns {Promise<Object>} A CatalogItemConnection object
 */
export default async function catalogItems(_, args, context, info) {
  const { redis } = context;
  const {
    shopIds: opaqueShopIds,
    tagIds: opaqueTagIds,
    booleanFilters,
    simpleFilters,
    priceRange,
    searchQuery,
    ...connectionArgs
  } = args;
  // if (simpleFilters[0].name === 'minPrice' && simpleFilters[1].name === 'maxPrice') {
  //   MinPrice = simpleFilters[0].value;
  //   MaxPrice = simpleFilters[1].value;
  // }

  const shopIds = opaqueShopIds && opaqueShopIds.map(decodeShopOpaqueId);
  const tagIds = opaqueTagIds && opaqueTagIds.map(decodeTagOpaqueId);

  let catalogBooleanFilters = {};
  if (Array.isArray(booleanFilters) && booleanFilters.length) {
    catalogBooleanFilters = await xformCatalogBooleanFilters(
      context,
      booleanFilters
    );
  }
  let catalogSimpleFilters = {};
  if (Array.isArray(simpleFilters) && simpleFilters.length) {
    catalogSimpleFilters = await xformCatalogSimpleFilters(
      context,
      simpleFilters
    );
  }



  if (connectionArgs.sortBy === "featured") {
    if (!tagIds || tagIds.length === 0) {
      throw new ReactionError(
        "not-found",
        "A tag ID is required for featured sort"
      );
    }
    if (tagIds.length > 1) {
      throw new ReactionError(
        "invalid-parameter",
        "Multiple tags cannot be sorted by featured. Only the first tag will be returned."
      );
    }
    const tagId = tagIds[0];

    return context.queries.catalogItemsAggregate(context, {
      catalogBooleanFilters,
      catalogSimpleFilters,
      connectionArgs,
      searchQuery,
      priceRange,
      shopIds,
      tagId,
    });
  }

  // minPrice is a sorting term that does not necessarily match the field path by which we truly want to sort.
  // We allow plugins to return the true field name, or fallback to the default pricing field.
  if (connectionArgs.sortBy === "minPrice") {
    let realSortByField;

    // Allow external pricing plugins to handle this if registered. We'll use the
    // first value returned that is a string.
    for (const func of context.getFunctionsOfType(
      "getMinPriceSortByFieldPath"
    )) {
      realSortByField = await func(context, { connectionArgs }); // eslint-disable-line no-await-in-loop
      if (typeof realSortByField === "string") break;
    }

    if (!realSortByField) {
      Logger.warn(
        "An attempt to sort catalog items by minPrice was rejected. " +
        "Verify that you have a pricing plugin installed and it registers a getMinPriceSortByFieldPath function."
      );
      throw new ReactionError(
        "invalid-parameter",
        "Sorting by minPrice is not supported"
      );
    }

    connectionArgs.sortBy = realSortByField;
  }

  const query = await context.queries.catalogItems(context, {
    catalogBooleanFilters,
    catalogSimpleFilters,
    searchQuery,
    priceRange,
    shopIds,
    tagIds,
  });


  return getPaginatedResponse(query, connectionArgs, {
    includeHasNextPage: wasFieldRequested("pageInfo.hasNextPage", info),
    includeHasPreviousPage: wasFieldRequested("pageInfo.hasPreviousPage", info),
    includeTotalCount: wasFieldRequested("totalCount", info),
  });
}





// import Logger from "@reactioncommerce/logger";
// import ReactionError from "@reactioncommerce/reaction-error";
// import getPaginatedResponse from "@reactioncommerce/api-utils/graphql/getPaginatedResponse.js";
// import wasFieldRequested from "@reactioncommerce/api-utils/graphql/wasFieldRequested.js";
// import { decodeShopOpaqueId, decodeTagOpaqueId } from "../../xforms/id.js";
// import xformCatalogBooleanFilters from "../../utils/catalogBooleanFilters.js";
// import xformCatalogSimpleFilters from "../../utils/catalogSimpleFilters.js";
// import { applyPagination, filterByPriceRange, filterBySearchQuery, filterBySimpleFilters, filterByTagIds } from "../../utils/redisDataFilter.js";

// /**
//  * @name Query/catalogItems
//  * @method
//  * @memberof Catalog/GraphQL
//  * @summary Get a list of catalogItems
//  * @param {Object} _ - unused
//  * @param {ConnectionArgs} args - an object of all arguments that were sent by the client
//  * @param {String[]} [args.searchQuery] - limit to catalog items matching this text search query
//  * @param {String[]} [args.shopIds] - limit to catalog items for these shops
//  * @param {String[]} [args.tagIds] - limit to catalog items with this array of tags
//  * @param {Object[]} [args.booleanFilters] - Array of boolean filter objects with `name` and `value`
//  *  * @param {Object[]} [args.simpleFilters] - Array of simple filter objects with `size`, `color`, `minprice`, `maxprice`
//  * @param {Object} context - an object containing the per-request state
//  * @param {Object} info Info about the GraphQL request
//  * @returns {Promise<Object>} A CatalogItemConnection object
//  */
// export default async function catalogItems(_, args, context, info) {
//   const { redis } = context;
//   const {
//     shopIds: opaqueShopIds,
//     tagIds: opaqueTagIds,
//     booleanFilters,
//     simpleFilters,
//     priceRange,
//     searchQuery,
//     ...connectionArgs
//   } = args;
//   // if (simpleFilters[0].name === 'minPrice' && simpleFilters[1].name === 'maxPrice') {
//   //   MinPrice = simpleFilters[0].value;
//   //   MaxPrice = simpleFilters[1].value;
//   // }

//   const shopIds = opaqueShopIds && opaqueShopIds.map(decodeShopOpaqueId);
//   const tagIds = opaqueTagIds && opaqueTagIds.map(decodeTagOpaqueId);

//   let catalogBooleanFilters = {};
//   if (Array.isArray(booleanFilters) && booleanFilters.length) {
//     catalogBooleanFilters = await xformCatalogBooleanFilters(
//       context,
//       booleanFilters
//     );
//   }
//   let catalogSimpleFilters = {};
//   if (Array.isArray(simpleFilters) && simpleFilters.length) {
//     catalogSimpleFilters = await xformCatalogSimpleFilters(
//       context,
//       simpleFilters
//     );
//   }


//   const flagData = 'IsRedisData';
//   const checkRedisData = await redis.get(flagData);

//   if (checkRedisData === "true") {
//     console.log("Fetching from Redis");
//     const cachedResult = await redis.get(`catalogItems`);
//     if (cachedResult) {
//       let parsedResult = JSON.parse(cachedResult);
//       parsedResult.nodes = filterBySearchQuery(parsedResult.nodes, searchQuery);
//       parsedResult.nodes = filterByPriceRange(parsedResult.nodes, priceRange);
//       parsedResult.nodes = filterBySimpleFilters(parsedResult.nodes, simpleFilters);
//       parsedResult.nodes = filterByTagIds(parsedResult.nodes, tagIds);

//       parsedResult.totalCount = parsedResult.nodes.length;

//       if (connectionArgs.first) {
//         const limit = parseInt(connectionArgs.first);
//         const offset = connectionArgs.offset ? parseInt(connectionArgs.offset) : 0;
//         parsedResult.nodes = applyPagination(parsedResult.nodes, limit, offset);
//       }

//       return parsedResult;
//     }
//   }

//   if (connectionArgs.sortBy === "featured") {
//     if (!tagIds || tagIds.length === 0) {
//       throw new ReactionError(
//         "not-found",
//         "A tag ID is required for featured sort"
//       );
//     }
//     if (tagIds.length > 1) {
//       throw new ReactionError(
//         "invalid-parameter",
//         "Multiple tags cannot be sorted by featured. Only the first tag will be returned."
//       );
//     }
//     const tagId = tagIds[0];

//     return context.queries.catalogItemsAggregate(context, {
//       catalogBooleanFilters,
//       catalogSimpleFilters,
//       connectionArgs,
//       searchQuery,
//       priceRange,
//       shopIds,
//       tagId,
//     });
//   }

//   // minPrice is a sorting term that does not necessarily match the field path by which we truly want to sort.
//   // We allow plugins to return the true field name, or fallback to the default pricing field.
//   if (connectionArgs.sortBy === "minPrice") {
//     let realSortByField;

//     // Allow external pricing plugins to handle this if registered. We'll use the
//     // first value returned that is a string.
//     for (const func of context.getFunctionsOfType(
//       "getMinPriceSortByFieldPath"
//     )) {
//       realSortByField = await func(context, { connectionArgs }); // eslint-disable-line no-await-in-loop
//       if (typeof realSortByField === "string") break;
//     }

//     if (!realSortByField) {
//       Logger.warn(
//         "An attempt to sort catalog items by minPrice was rejected. " +
//         "Verify that you have a pricing plugin installed and it registers a getMinPriceSortByFieldPath function."
//       );
//       throw new ReactionError(
//         "invalid-parameter",
//         "Sorting by minPrice is not supported"
//       );
//     }

//     connectionArgs.sortBy = realSortByField;
//   }

//   const query = await context.queries.catalogItems(context, {
//     catalogBooleanFilters,
//     catalogSimpleFilters,
//     searchQuery,
//     priceRange,
//     shopIds,
//     tagIds,
//   });


//   return getPaginatedResponse(query, connectionArgs, {
//     includeHasNextPage: wasFieldRequested("pageInfo.hasNextPage", info),
//     includeHasPreviousPage: wasFieldRequested("pageInfo.hasPreviousPage", info),
//     includeTotalCount: wasFieldRequested("totalCount", info),
//   });
// }
