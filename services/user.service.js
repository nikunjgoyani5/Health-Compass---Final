import UserModel from "../models/user.model.js";

const find = async (filter) => {
  return UserModel.find(filter);
};

const findOne = async (filter, lean = false) => {
  const query = UserModel.findOne(filter);
  return lean ? query.lean() : query;
};

const findById = async (id) => {
  return UserModel.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return UserModel.findByIdAndUpdate(id, { $set: data }, { new: true });
};

const updateSingleField = async (id, data) => {
  const user = await UserModel.findById(id);
  if (!user) return null;
  // Deep merge existing user data with incoming update data
  const deepMerge = (target, source) => {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        if (!target[key] || typeof target[key] !== "object") {
          target[key] = {};
        }
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  };
  const updatedData = { ...user.toObject() };
  deepMerge(updatedData, data);
  return UserModel.findByIdAndUpdate(id, updatedData, { new: true });
};

const findOneAndUpdate = async (filter, data) => {
  return UserModel.findOneAndUpdate(filter, { $set: data }, { new: true });
};

const countDocuments = async (filter) => {
  return UserModel.countDocuments(filter);
};

const create = async (data) => {
  return UserModel.create(data);
};

const findByIdAndDelete = async (id) => {
  return UserModel.findByIdAndDelete(id);
};

const update = async (filter, updateData) => {
  return UserModel.findOneAndUpdate(filter, updateData, { new: true });
};

const deleteOne = async (id) => {
  return UserModel.deleteOne(id);
};

const updateOne = async (query, updateData) => {
  return await UserModel.findOneAndUpdate(query, updateData, { new: true });
};

export default {
  find,
  findOne,
  findById,
  create,
  update,
  findByIdAndUpdate,
  countDocuments,
  findOneAndUpdate,
  findByIdAndDelete,
  deleteOne,
  updateSingleField,
  updateOne,
};
