export default async function globalSearch(_, args, context, info) {
  const { Accounts, Catalog } = context.collections;
  const { searchQuery, skip, limit, searchType } = args;

  let catalogPipeline = [
    {
      $search: {
        index: "catalog-search",
        autocomplete: {
          path: "product.title",
          query: searchQuery,
        },
      },
    },
    {
      "$match": {
        "product.isDeleted": false,   
        "product.isVisible": true,
        "product.isSoldOut": false
      }
    },
    { $project: { score: { $meta: "searchScore" }, doc: "$$ROOT" } },
    {
      $project: {
        _id: "$doc.product._id",
        slug: "$doc.product.slug",
        title: "$doc.product.title",
        description: "$doc.product.description",
        media: "$doc.product.media",
        variant: "$doc.product.variants",
        score: "$score",
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  let accountPipeline = [
    {
      $search: {
        index: "seller-search",
        autocomplete: {
          path: "storeName",
          query: searchQuery,
        },
      },
    },
    { $project: { score: { $meta: "searchScore" }, doc: "$$ROOT" } },
    {
      $project: {
        _id: "$doc._id",
        name: "$doc.name",
        storeName: "$doc.storeName",
        image: "$doc.image",
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  let catalog, storeData;

  if (searchType === "product") {
    catalog = await Catalog.aggregate(catalogPipeline).toArray();
  } else if (searchType === "store") {
    storeData = await Accounts.aggregate(accountPipeline).toArray();
  } else {
    [catalog, storeData] = await Promise.all([
      Catalog.aggregate(catalogPipeline).toArray(),
      Accounts.aggregate(accountPipeline).toArray(),
    ]);
  }


  return { catalog, storeData };
}
