﻿using Wolder.Core.Files;
using Wolder.Core.Pipeline;
using Wolder.CSharp.Compilation;

namespace Wolder.CSharp.Actions;

public record CompileProject(DotNetProjectReference Project)
    : IActionDefinition<CompileProjectAction>;

public class CompileProjectAction(DotNetProjectFactory dotNetProjectFactory) 
    : PipelineActionBase<CompileProject>
{
    protected override async Task ExecuteAsync(IPipelineActionContext _, CompileProject parameters)
    {
        var project = dotNetProjectFactory.Create(parameters.Project);
        if ((await project.TryCompileAsync()) is CompilationResult.Failure)
        {
            throw new InvalidOperationException($"Couldn't compile {project.BasePath}");
        }
    }
}