namespace Wolder.Core.Workspace;

public interface IPipelineStep
{
    Type DefinitionType { get; }
    IActionDefinition GetDefinition(IPipelineContext context);
}