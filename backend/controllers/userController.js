const db = require("../config/db");

// Get user profile with profile image
exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Get user basic info
    const [userRows] = await db.query(
      "SELECT id, email, phone, role, created_at FROM users WHERE id = ?",
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = userRows[0];

    // Get role-specific profile data
    let profileData = {};
    
    if (user.role === 'customer') {
      const [profileRows] = await db.query(
        "SELECT full_name, country, city, area, profile_image, latitude, longitude, payment_methods FROM customers WHERE user_id = ?",
        [userId]
      );
      if (profileRows.length > 0) {
        profileData = profileRows[0];
      }
    } else if (user.role === 'supplier') {
      const [profileRows] = await db.query(
        "SELECT full_name, country, city, area, profile_image, latitude, longitude, payment_methods, selected_brands FROM suppliers WHERE user_id = ?",
        [userId]
      );
      if (profileRows.length > 0) {
        profileData = profileRows[0];
      }
    } else if (user.role === 'delivery_guy' || user.role === 'driver') {
      const [profileRows] = await db.query(
        "SELECT full_name, phone, city, area, vehicle_type, plate_number, status, latitude, longitude FROM delivery_guy WHERE user_id = ?",
        [userId]
      );
      if (profileRows.length > 0) {
        profileData = profileRows[0];
      }
    }

    // Combine user and profile data
    const userProfile = {
      ...user,
      ...profileData,
      // Ensure profile_image is properly included
      profileImage: profileData.profile_image || null
    };

    res.json({
      success: true,
      data: userProfile
    });

  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user profile"
    });
  }
};

// Update user profile (including profile image)
exports.updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { profile_image, ...otherData } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Get user role first
    const [userRows] = await db.query(
      "SELECT role FROM users WHERE id = ?",
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const userRole = userRows[0].role;

    // Update profile based on role
    let updateQuery = "";
    let updateValues = [];
    let profileTable = "";

    if (userRole === 'customer') {
      profileTable = "customers";
      const allowedFields = ['full_name', 'country', 'city', 'area', 'latitude', 'longitude', 'payment_methods'];
      const validUpdates = [];
      
      Object.keys(otherData).forEach(key => {
        if (allowedFields.includes(key)) {
          validUpdates.push(`${key} = ?`);
          updateValues.push(otherData[key]);
        }
      });

      if (profile_image !== undefined) {
        validUpdates.push("profile_image = ?");
        updateValues.push(profile_image);
      }

      if (validUpdates.length > 0) {
        updateQuery = `UPDATE ${profileTable} SET ${validUpdates.join(', ')} WHERE user_id = ?`;
        updateValues.push(userId);
      }
    } else if (userRole === 'supplier') {
      profileTable = "suppliers";
      const allowedFields = ['full_name', 'country', 'city', 'area', 'latitude', 'longitude', 'payment_methods', 'selected_brands'];
      const validUpdates = [];
      
      Object.keys(otherData).forEach(key => {
        if (allowedFields.includes(key)) {
          validUpdates.push(`${key} = ?`);
          updateValues.push(otherData[key]);
        }
      });

      if (profile_image !== undefined) {
        validUpdates.push("profile_image = ?");
        updateValues.push(profile_image);
      }

      if (validUpdates.length > 0) {
        updateQuery = `UPDATE ${profileTable} SET ${validUpdates.join(', ')} WHERE user_id = ?`;
        updateValues.push(userId);
      }
    } else if (userRole === 'delivery_guy' || userRole === 'driver') {
      profileTable = "delivery_guy";
      const allowedFields = ['full_name', 'phone', 'city', 'area', 'vehicle_type', 'plate_number', 'status', 'latitude', 'longitude'];
      const validUpdates = [];
      
      Object.keys(otherData).forEach(key => {
        if (allowedFields.includes(key)) {
          validUpdates.push(`${key} = ?`);
          updateValues.push(otherData[key]);
        }
      });

      if (validUpdates.length > 0) {
        updateQuery = `UPDATE ${profileTable} SET ${validUpdates.join(', ')} WHERE user_id = ?`;
        updateValues.push(userId);
      }
    }

    if (updateQuery) {
      await db.query(updateQuery, updateValues);
    }

    // Get updated profile
    const updatedProfile = await exports.getUserProfile({ params: { userId } }, {
      json: (data) => data
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedProfile
    });

  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user profile"
    });
  }
};
