import * as React from 'react';
import './ProjectOverview.css';

interface ProjectOverviewProps {
  project: {
    name: string;
    path: string;
    language: string[];
    framework: string;
    files?: number;
    dependencies?: string[];
    lastModified?: Date;
  };
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({ project }) => {
  return (
    <div className="project-overview">
      <div className="project-info-grid">
        <div className="info-item">
          <span className="info-icon">📁</span>
          <div className="info-content">
            <span className="info-label">Project Name</span>
            <span className="info-value">{project.name}</span>
          </div>
        </div>

        <div className="info-item">
          <span className="info-icon">📍</span>
          <div className="info-content">
            <span className="info-label">Location</span>
            <span className="info-value" title={project.path}>
              {project.path.split(/[\\\/]/).slice(-2).join('/')}
            </span>
          </div>
        </div>

        <div className="info-item">
          <span className="info-icon">💻</span>
          <div className="info-content">
            <span className="info-label">Languages</span>
            <span className="info-value">{project.language.join(', ')}</span>
          </div>
        </div>

        <div className="info-item">
          <span className="info-icon">🛠️</span>
          <div className="info-content">
            <span className="info-label">Framework</span>
            <span className="info-value">{project.framework}</span>
          </div>
        </div>

        {project.files && (
          <div className="info-item">
            <span className="info-icon">📄</span>
            <div className="info-content">
              <span className="info-label">Files</span>
              <span className="info-value">{project.files}</span>
            </div>
          </div>
        )}

        {project.dependencies && (
          <div className="info-item">
            <span className="info-icon">📦</span>
            <div className="info-content">
              <span className="info-label">Dependencies</span>
              <span className="info-value">{project.dependencies.length}</span>
            </div>
          </div>
        )}
      </div>

      {project.dependencies && project.dependencies.length > 0 && (
        <div className="dependencies-section">
          <h4>Key Dependencies</h4>
          <div className="dependencies-list">
            {project.dependencies.slice(0, 8).map((dep, index) => (
              <span key={index} className="dependency-tag">{dep}</span>
            ))}
            {project.dependencies.length > 8 && (
              <span className="dependency-tag more">+{project.dependencies.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};