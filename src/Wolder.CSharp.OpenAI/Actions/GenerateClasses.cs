using System.Text;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.OpenAI.Actions;

public record GenerateClassesParameters(DotNetProjectReference project, string filePath, string behaviorPrompt);

public class GenerateClasses(
    IAIAssistant assistant,
    ILogger<GenerateClasses> logger,
    DotNetProjectFactory projectFactory,
    ISourceFiles sourceFiles,
    GenerateClassesParameters parameters) 
    : IVoidAction<GenerateClassesParameters>
{
    public async Task InvokeAsync()
    {
        var (projectRef, filePath, behaviorPrompt) = parameters;
        var tree = GetDirectoryTree(sourceFiles.RootDirectoryPath);
        var response = await assistant.CompletePromptAsync($$"""
            You are a C# and razor code generator. The code you create will be compiled immediately and tested.
            Output only C# or razor files, your output will be directly written to one or more files. 
            When you generate services you must also generate an interface i.e. TestService should implement
            ITestService.
            Generate any new types needed (i.e. Models, Interfaces).
            Generate `using {namespace};` for any referenced types. Usings are not automatically resolved.
            Assume the files will be added to a single dotnet 8.0 project. The base namespace of the
            project is `{{projectRef.Name}}`. 
            Each file should always have a delimited header like this:

            // === START FILE: ProjectName/Namespace/Namespace/ClassName.cs
            File contents
            // === END FILE: ProjectName/Namespace/Namespace/ClassName.cs
            // === START FILE: ProjectName/Namespace/Namespace/ClassName.razor
            File contents
            // === END FILE: ProjectName/Namespace/Namespace/ClassName.razor

            For context, here is a listing of the current directory tree.
            {{tree}}

            Create files that implement the following behavior:
            {{behaviorPrompt}}
            """);

        logger.LogInformation(response);

        await SplitAndSaveFilesAsync(parameters, response);

        var project = projectFactory.Create(projectRef);
        var compiles = await project.TryCompileAsync();
        if (compiles is CompilationResult.Failure)
            throw new("No compile");
    }
    
    private async Task SplitAndSaveFilesAsync(GenerateClassesParameters parameters, string input)
    {
        var sanitized = Sanitize(input);

        logger.LogInformation(sanitized);

        var (projectRef, filePath, _) = parameters;
        var rootPath = Path.Combine(projectRef.RelativeRoot, filePath);
        using (StringReader reader = new StringReader(sanitized))
        {
            StringBuilder fileContent = new StringBuilder();
            string? line;
            string? currentFileName = null;

            while ((line = reader.ReadLine()) != null)
            {
                if (line.Contains("=== START FILE:"))
                {
                    currentFileName = ExtractFileName(line);
                    fileContent.Clear();
                }
                else if (line.Contains("=== END FILE:"))
                {
                    if (currentFileName != null)
                    {
                        await sourceFiles.WriteFileAsync(Path.Combine(rootPath, currentFileName), fileContent.ToString());
                        currentFileName = null;
                    }
                }
                else if (currentFileName != null)
                {
                    fileContent.AppendLine(line);
                }
            }
        }
    }

    static string ExtractFileName(string line)
    {
        return line.Split(new string[] { "=== START FILE:" }, StringSplitOptions.None).Last().Trim();
    }
    
    private static string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
    
    private string GetDirectoryTree(string rootPath)
    {
        StringBuilder treeBuilder = new StringBuilder();

        // Start the recursive method to build the directory tree string
        BuildDirectoryTree(rootPath, "", treeBuilder);

        // Print the entire tree at once
        string tree = treeBuilder.ToString();
        logger.LogInformation(tree);
        return tree;
    }

    static void BuildDirectoryTree(string directoryPath, string indent, StringBuilder treeBuilder)
    {
        try
        {
            // Get all directories in the current directory
            string[] directories = Directory.GetDirectories(directoryPath);

            foreach (string directory in directories)
            {
                // Skip bin and obj directories
                if (directory.EndsWith("\\bin") || directory.EndsWith("\\obj"))
                {
                    continue;
                }

                treeBuilder.AppendLine($"{indent}+ {new DirectoryInfo(directory).Name}");
                // Recursively build the string for the contents of this directory
                BuildDirectoryTree(directory, indent + "  ", treeBuilder);
            }

            // Get all files in the current directory
            string[] files = Directory.GetFiles(directoryPath);

            foreach (string file in files)
            {
                treeBuilder.AppendLine($"{indent}- {Path.GetFileName(file)}");
            }
        }
        catch (UnauthorizedAccessException)
        {
            treeBuilder.AppendLine($"{indent}! Access Denied");
        }
    }
}