"use strict";

module.exports = (sequelize, DataTypes) => {
  const PersonalInfo = sequelize.define(
    "PersonalInfo",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      resume_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      phone: {
        type: DataTypes.STRING(30)
      },
      address: {
        type: DataTypes.STRING(255)
      },
      linkedin_url: {
        type: DataTypes.STRING(255)
      },
      portfolio_url: {
        type: DataTypes.STRING(255)
      },
      photo_url: {
        type: DataTypes.TEXT
      }
    },
    {
      tableName: "personal_info",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  PersonalInfo.associate = (models) => {
    PersonalInfo.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return PersonalInfo;
};
