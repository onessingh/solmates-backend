"use strict";

module.exports = (sequelize, DataTypes) => {
  const Template = sequelize.define(
    "Template",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      is_ats_friendly: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: "templates",
      underscored: true,
      timestamps: false
    }
  );

  Template.associate = (models) => {
    Template.hasMany(models.Resume, { foreignKey: "selected_template", sourceKey: "name", as: "resumes" });
  };

  return Template;
};
