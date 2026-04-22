"use strict";

module.exports = (sequelize, DataTypes) => {
  const CoverLetter = sequelize.define(
    "CoverLetter",
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
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: "cover_letters",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["user_id"] }
      ]
    }
  );

  CoverLetter.associate = (models) => {
    CoverLetter.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
  };

  return CoverLetter;
};
