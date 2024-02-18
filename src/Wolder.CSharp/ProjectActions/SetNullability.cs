using Microsoft.Build.Construction;
using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.ProjectActions;

public enum ProjectNullability
{
    Enable,
    Disable
}

public record SetNullabilityParameters(DotNetProjectReference Project, ProjectNullability Nullability);

public class SetNullability(
    ISourceFiles sourceFiles,
    SetNullabilityParameters parameters)
    : IVoidAction<SetNullabilityParameters>
{
    public Task InvokeAsync()
    {
        var csprojPath = sourceFiles.GetAbsolutePath(parameters.Project.RelativeFilePath);
        var projectRoot = ProjectRootElement.Open(csprojPath);

        var propertyGroup = projectRoot.PropertyGroups
            .FirstOrDefault(x => x.Properties.Any(p => p.Name == "Nullable"))
            ?? projectRoot.PropertyGroups
                .FirstOrDefault(x => x.Properties.Any(p => p.Name == "TargetFramework"));

        var nullability = parameters.Nullability switch
        {
            ProjectNullability.Enable => "enable",
            ProjectNullability.Disable => "disable",
            _ => throw new InvalidOperationException("Unknown nullability")
        };
    
        if (propertyGroup != null)
        {
            propertyGroup.AddProperty("Nullable", nullability);
        }
        else
        {
            propertyGroup = projectRoot.AddPropertyGroup();
            propertyGroup.AddProperty("Nullable", nullability);
        }

        projectRoot.Save();

        return Task.CompletedTask;
    }
}