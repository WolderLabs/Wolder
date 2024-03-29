﻿using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.CodeActions;

public record CreateClassParameters(DotNetProjectReference Project, string ClassName, string ClassContent);

public class CreateClass(
    ISourceFiles sourceFiles,
    CreateClassParameters parameters) 
    : IVoidAction<CreateClassParameters>
{
    public async Task InvokeAsync()
    {
        await sourceFiles.WriteFileAsync(
            Path.Combine(parameters.Project.RelativeRoot, $"{parameters.ClassName}.cs"), 
            parameters.ClassContent);
    }
}