import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/.+\@.+\..+/, "Please use a valid email address"],
    },

    passwordHash: {
      type: String,
      required: true,
    },

    publicKey: {
      type: String,
      required: false, 
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;