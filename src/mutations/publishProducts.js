/* eslint-disable no-undef */
import _ from "lodash";
import Logger from "@reactioncommerce/logger";
import ReactionError from "@reactioncommerce/reaction-error";
import publishProductsToCatalog from "../utils/publishProductsToCatalog.js";

/**
 *
 * @method publishProducts
 * @summary Publish an array of products to the Catalog collection by Product ID
 * @param {Object} context -  an object containing the per-request state
 * @param {Array} productIds - An array of product IDs
 * @returns {Promise<Object[]>} Array of CatalogItemProduct objects
 */
export default async function publishProducts(context, productIds) {
  const { collections, redis } = context;
  const { Catalog, Products } = collections;

  // Find all products
  const products = await Products.find(
    {
      _id: { $in: productIds }
    },
    { _id: 1, shopId: 1 }
  ).toArray();

  if (products.length !== productIds.length) {
    throw new ReactionError("not-found", "Some products not found");
  }

  const uniqueShopIds = _.uniq(products.map((product) => product.shopId));
  for (const shopId of uniqueShopIds) {
    // TODO(pod-auth): create helper to handle multiple permissions checks for multiple items
    for (const product of products) {
      // eslint-disable-next-line no-await-in-loop

      const internalContext = context.getInternalContext();
      await internalContext.validatePermissions(
        `reaction:legacy:products:${product._id}`,
        "publish",
        { shopId }
      );
    }
  }

  const success = await publishProductsToCatalog(productIds, context);
  if (!success) {
    Logger.error("Some Products could not be published to the Catalog.");
    throw new ReactionError(
      "server-error",
      "Some Products could not be published to the Catalog. Make sure the parent product and its variants and options are visible."
    );
  }
  const catalogProduct = await Catalog.find({ "product.productId": { $in: productIds } }).toArray();

  invalidateAndUpdateCache(redis, catalogProduct)

  return catalogProduct
}



async function invalidateAndUpdateCache(redis, products) {
  const redisKey = 'catalogItems';  // Exact key without wildcard.
  // console.log("Looking for products: ", products);

  // Assuming 'catalogItems' is a key for a serialized object or a list.
  const cachedObjectSerialized = await redis.get(redisKey);
  if (!cachedObjectSerialized) {
    console.log("No cached data found under key:", redisKey);
    return;
  }


  let cachedObject = JSON.parse(cachedObjectSerialized);
  // console.log("cachedObject serialized", cachedObject);
  let nodes = cachedObject.nodes;
  let updates = [];
  let unmatchedProducts = [...products];

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!node.product) continue;

    const productIndex = unmatchedProducts.findIndex(p => p.product && p.product._id === node.product._id);
    if (productIndex === -1) {
      // console.log(No matching product found or product is undefined for ID: ${node.product._id});
      continue;
    }

    // Remove the matched product from unmatchedProducts list.
    const [matchedProduct] = unmatchedProducts.splice(productIndex, 1);
    const { product } = matchedProduct;

    if (product.isDeleted || !product.isVisible || product.isSoldOut) {
      // console.log(Removing product ${product._id} from Redis because it is either deleted or not visible.);
      nodes.splice(index--, 1);
    } else {
      // console.log(Updating product ${product._id} in Redis.);
      nodes[index].product = { ...node.product, ...product };
    }
    // updates.push(redis.set(redisKey, JSON.stringify(cachedObject), "EX", 604800));
  }

  // Insert unmatched products at the beginning of the Redis list.
  for (const unmatchedProduct of unmatchedProducts) {
    nodes.unshift(unmatchedProduct)

  }
  cachedObject.nodes = nodes;
  updates.push(redis.set(redisKey, JSON.stringify(cachedObject), "EX", 604800));

  if (!updates.length) {
    Logger.error("No products matched in Redis cache or no updates necessary.");
    throw new ReactionError(
      "server-error",
      "No products matched in Redis cache or no updates necessary"
    );
  }

  return;
}
