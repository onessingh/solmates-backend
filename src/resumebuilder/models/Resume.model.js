"use strict";

module.exports = (sequelize, DataTypes) => {
  const Resume = sequelize.define(
    "Resume",
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
      title: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      selected_template: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      resume_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100
        }
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      deleted_at: {
        type: DataTypes.DATE
      }
    },
    {
      tableName: "resumes",
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [
        { fields: ["user_id"] }
      ]
    }
  );

  Resume.associate = (models) => {
    Resume.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    Resume.belongsTo(models.Template, { foreignKey: "selected_template", targetKey: "name", as: "template" });
    Resume.hasOne(models.PersonalInfo, { foreignKey: "resume_id", as: "personal_info" });
    Resume.hasOne(models.Summary, { foreignKey: "resume_id", as: "summary" });
    Resume.hasMany(models.Experience, { foreignKey: "resume_id", as: "experience" });
    Resume.hasMany(models.Education, { foreignKey: "resume_id", as: "education" });
    Resume.hasMany(models.Skill, { foreignKey: "resume_id", as: "skills" });
    Resume.hasMany(models.Certification, { foreignKey: "resume_id", as: "certifications" });
    Resume.hasMany(models.Language, { foreignKey: "resume_id", as: "languages" });
    Resume.hasMany(models.Analytic, { foreignKey: "resume_id", as: "analytics" });
  };

  return Resume;
};
