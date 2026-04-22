"use strict";

module.exports = (sequelize, DataTypes) => {
  const Analytic = sequelize.define(
    "Analytic",
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
      event_type: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      metadata: {
        type: DataTypes.JSONB
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: "analytics",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Analytic.associate = (models) => {
    Analytic.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Analytic;
};
