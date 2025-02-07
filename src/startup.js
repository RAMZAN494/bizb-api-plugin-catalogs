import Logger from "@reactioncommerce/logger";
import hashProduct from "./mutations/hashProduct.js";
import sellerAccountUpdation from './utils/sellerAccountUpdation.js';
import Random from "@reactioncommerce/random";
import cron from 'node-cron';

/**
 * @summary Called on startup
 * @param {Object} context Startup context
 * @param {Object} context.collections Map of MongoDB collections
 * @returns {undefined}
 */
export default async function catalogStartup(context) {
  // pushItemTORedis(context)



  const { appEvents, collections } = context;

  const { Catalog, SimpleInventory } = collections;

  cron.schedule('0 0 * * * *', async () => {
    console.log('Running a task every 10 seconds');
    try {
      const pipeline = [
        {
          $match: {
            "product.metafields.value": "Mobile",
            "product.isSoldOut": false
          }
        },
        {
          $lookup: {
            from: "SimpleInventory",
            localField: "product._id",
            foreignField: "productConfiguration.productId",
            as: "inventoryDetails"
          }
        },
        {
          $match: { "inventoryDetails": { $eq: [] } }
        },
        {
          $project: {
            "productId": "$product._id",
            "variantIds": "$product.variants._id"
          }
        }
      ];
      // Increase the time limit to 120 seconds
      const options = { maxTimeMS: 120000 };
      const results = await Catalog.aggregate(pipeline, options).toArray();

      for (let i = 0; i < results.length; i++) {
        const doc = results[i];
        if (doc.variantIds && doc.variantIds.length > 0) {
          for (let j = 0; j < doc.variantIds.length; j++) {
            const variantId = doc.variantIds[j];
            const newInventoryRecord = createInventoryRecord(doc.productId, variantId);
            await SimpleInventory.insertOne(newInventoryRecord);
          }
        } else {
          const newInventoryRecord = createInventoryRecord(doc.productId, null);
          await SimpleInventory.insertOne(newInventoryRecord);
        }
      }
      console.log('Inventory records have been successfully added.');
    } catch (err) {
      console.error('Error occurred:', err);
    } finally {
      await client.close();
    }
  });

  appEvents.on("afterMediaInsert", ({ mediaRecord }) => {
    const { productId } = mediaRecord.metadata || {};
    if (productId) {
      hashProduct(productId, collections, false).catch((error) => {
        Logger.error(`Error updating currentProductHash for product with ID ${productId}`, error);
      });
    }
  });

  appEvents.on("afterMediaUpdate", ({ mediaRecord }) => {
    const { productId } = mediaRecord.metadata || {};
    if (productId) {
      hashProduct(productId, collections, false).catch((error) => {
        Logger.error(`Error updating currentProductHash for product with ID ${productId}`, error);
      });
    }
  });

  appEvents.on("afterMediaRemove", ({ mediaRecord }) => {
    const { productId } = mediaRecord.metadata || {};
    if (productId) {
      hashProduct(productId, collections, false).catch((error) => {
        Logger.error(`Error updating currentProductHash for product with ID ${productId}`, error);
      });
    }
  });

  appEvents.on("afterProductSoftDelete", ({ product }) => {
    collections.Catalog.updateOne({
      "product.productId": product._id
    }, {
      $set: {
        "product.isDeleted": true
      }
    });
  });

  const productOrVariantUpdateHandler = ({ productId }) => {
    if (productId) {
      hashProduct(productId, collections, false).catch((error) => {
        Logger.error(`Error updating currentProductHash for product with ID ${productId}`, error);
      });
    }
  };
  const sellerAccountUpdateHandler = async ({ productId, product }) => {
    if (productId) {
      sellerAccountUpdation(productId, product, collections)
    }
  };



  appEvents.on("viewInsights", async ({ context, payload }) => {
    const { collections } = context;
    const { Catalog } = collections;

    const { productId } = payload;

    const product = await Catalog.findOne(payload);

    if (product) {
      // Increment view count
      const updatedViewCount = (product.viewCount || 0) + 1;

      // Update the product document with the incremented view count
      const updateProduct = await Catalog.updateOne(
        { _id: product._id }, // Using _id to uniquely identify the product
        { $inc: { "product.viewCount": updatedViewCount } }
      );
    }

  });


  appEvents.on("afterProductUpdate", productOrVariantUpdateHandler);
  appEvents.on("afterProductUpdate", sellerAccountUpdateHandler);
  appEvents.on("afterVariantUpdate", productOrVariantUpdateHandler);


}


// async function pushItemTORedis(context) {
//   if (!context || !context.redis) {
//     console.error("Redis client is not available in the context.");
//     return;
//   }
//   const { collections, redis } = context;
//   const { Catalog } = collections;

//   const redisKey = 'catalogItems';
//   const flagKey = 'IsRedisData';

//   // Check if the flag 'IsRedisData' is set to true in Redis.
//   const isDataAlreadySet = await redis.get(flagKey);
//   if (isDataAlreadySet === 'true') {
//     console.log("Redis data is already set, skipping update.");
//     return;
//   }

//   let query = {
//     "product.isDeleted": { $ne: true },
//     "product.isSoldOut": { $ne: true },
//     "product.isVisible": true,
//     "product.pricing.USD.minPrice": { $ne: null },
//     "product.pricing.USD.maxPrice": { $ne: null }
//   };

//   const catalogItems = await Catalog.find(query).sort({ "product.createdAt": -1 }).toArray();
//   const totalCount = await Catalog.countDocuments(query);

//   const catalogData = {
//     nodes: catalogItems,
//     totalCount: totalCount,
//   };

//   // Store catalog data to Redis and set the expiration.
//   await redis.set(redisKey, JSON.stringify(catalogData), "EX", 604800);

//   // Set the flag 'IsRedisData' to true after successfully setting the catalog data.
//   await redis.set(flagKey, 'true', "EX", 604800);

//   console.log("Redis data has been updated successfully.");
// }



function createInventoryRecord(productId, variantId) {
  return {
    "_id": Random.id(),
    "productConfiguration": {
      "productVariantId": variantId,
      "productId": productId
    },
    "shopId": "riaaGLe2RjanTBQzw",
    "canBackorder": false,
    "createdAt": new Date(),
    "inventoryInStock": 1,
    "inventoryReserved": 0,
    "isEnabled": true,
    "lowInventoryWarningThreshold": 0,
    "updatedAt": new Date()
  };
}

