"use strict";

module.exports = (sequelize, DataTypes) => {
  const Summary = sequelize.define(
    "Summary",
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
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      }
    },
    {
      tableName: "summary",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Summary.associate = (models) => {
    Summary.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Summary;
};
