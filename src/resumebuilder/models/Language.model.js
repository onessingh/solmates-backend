"use strict";

module.exports = (sequelize, DataTypes) => {
  const Language = sequelize.define(
    "Language",
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
      language: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      proficiency: {
        type: DataTypes.STRING(50),
        allowNull: false
      }
    },
    {
      tableName: "languages",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Language.associate = (models) => {
    Language.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Language;
};
