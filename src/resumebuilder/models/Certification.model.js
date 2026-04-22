"use strict";

module.exports = (sequelize, DataTypes) => {
  const Certification = sequelize.define(
    "Certification",
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
      name: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      issuer: {
        type: DataTypes.STRING(150)
      },
      issue_date: {
        type: DataTypes.DATEONLY
      }
    },
    {
      tableName: "certifications",
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["resume_id"] }
      ]
    }
  );

  Certification.associate = (models) => {
    Certification.belongsTo(models.Resume, { foreignKey: "resume_id", as: "resume" });
  };

  return Certification;
};
