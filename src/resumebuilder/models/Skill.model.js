"use strict";

module.exports = (sequelize, DataTypes) => {
  const Skill = sequelize.define(
    "Skill",
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
      skill_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      }
    },
    {
      tableName: "skills",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Skill.associate = (models) => {
    Skill.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Skill;
};
