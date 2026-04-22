"use strict";

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      full_name: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      email: {
        type: DataTypes.STRING(320),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      provider: {
        type: DataTypes.ENUM("local", "google", "linkedin"),
        allowNull: false,
        defaultValue: "local"
      },
      is_premium: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      deleted_at: {
        type: DataTypes.DATE
      }
    },
    {
      tableName: "users",
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at"
    }
  );

  User.associate = (models) => {
    User.hasMany(models.Resume, { foreignKey: "user_id", as: "resumes" });
    User.hasMany(models.CoverLetter, { foreignKey: "user_id", as: "cover_letters" });
    User.hasMany(models.JobApplication, { foreignKey: "user_id", as: "job_applications" });
    User.hasMany(models.AiLog, { foreignKey: "user_id", as: "ai_logs" });
  };

  return User;
};
