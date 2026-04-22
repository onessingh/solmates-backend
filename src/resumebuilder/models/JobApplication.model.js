"use strict";

module.exports = (sequelize, DataTypes) => {
  const JobApplication = sequelize.define(
    "JobApplication",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      company: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      role: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM("draft", "applied", "interview", "offer", "rejected", "accepted"),
        allowNull: false,
        defaultValue: "draft"
      },
      applied_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: "job_applications",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["user_id"] }
      ]
    }
  );

  JobApplication.associate = (models) => {
    JobApplication.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
  };

  return JobApplication;
};
