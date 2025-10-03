import mongoose from "mongoose";
import config from "../config/config.js";

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodb.url, config.mongodb.options);
    console.log("Database connection established");
  } catch (error) {
    console.log(`Error connecting to Mongo`, error);
  }
};

export default connectDB;
