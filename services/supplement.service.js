const parseMultipartArrays = (req, res, next) => {
  const arrayFields = [
    "ingredients",
    "usageGroup",
    "warnings",
    "claims",
    "tags",
  ];

  arrayFields.forEach((field) => {
    if (req.body[field]) {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch (e) {
        // keep as string if not valid JSON
      }
    }
  });

  if (req.body.isAvailable) {
    req.body.isAvailable = req.body.isAvailable === "true";
  }

  next();
};

export default {
  parseMultipartArrays,
};
