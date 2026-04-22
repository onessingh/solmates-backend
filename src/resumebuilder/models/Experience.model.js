"use strict";

module.exports = (sequelize, DataTypes) => {
  const Experience = sequelize.define(
    "Experience",
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
      job_title: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      company: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      start_date: {
        type: DataTypes.DATEONLY
      },
      end_date: {
        type: DataTypes.DATEONLY
      },
      description: {
        type: DataTypes.TEXT
      },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: "experience",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Experience.associate = (models) => {
    Experience.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Experience;
};
