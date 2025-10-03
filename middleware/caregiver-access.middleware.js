import UserModel from "../models/user.model.js";

const caregiverAccessUser = async (requesterId, targetUserId) => {
  if (String(requesterId) === String(targetUserId)) return true;

  const user = await UserModel.findById(requesterId).select("iCareFor").lean();
  return (
    user?.iCareFor?.some((id) => String(id) === String(targetUserId)) || false
  );
};


export default caregiverAccessUser;
