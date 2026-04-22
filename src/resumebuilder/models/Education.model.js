"use strict";

module.exports = (sequelize, DataTypes) => {
  const Education = sequelize.define(
    "Education",
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
      degree: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      institution: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      start_year: {
        type: DataTypes.INTEGER
      },
      end_year: {
        type: DataTypes.INTEGER
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
      tableName: "education",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Education.associate = (models) => {
    Education.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Education;
};
