"use strict";

module.exports = (sequelize, DataTypes) => {
  const AiLog = sequelize.define(
    "AiLog",
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
      action_type: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      input_tokens: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      output_tokens: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: "ai_logs",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["user_id"] }
      ]
    }
  );

  AiLog.associate = (models) => {
    AiLog.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
  };

  return AiLog;
};
