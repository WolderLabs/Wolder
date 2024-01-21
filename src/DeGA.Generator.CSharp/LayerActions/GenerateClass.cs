using DeGA.Core;
using DeGA.Generator.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using System.Text.RegularExpressions;

namespace DeGA.Generator.CSharp.LayerActions
{
    //public class GenerateClass : IGeneratorAction<GenerateClassOptions>
    //{
    //    private readonly IAIAssistant _assistant;
    //    private readonly ILogger<GenerateClass> _logger;
    //    private readonly GenerateClassOptions _options;

    //    public GenerateClass(IAIAssistant assistant, ILogger<GenerateClass> logger, GenerateClassOptions options)
    //    {
    //        _assistant = assistant;
    //        _logger = logger;
    //        _options = options;
    //    }

    //    public async Task InvokeAsync(Generator layer)
    //    {
    //        var response = await _assistant.CompletePromptAsync($"""
    //            You are a C# code generator. Output only C#, your output will be directly written to a `.cs` file.
    //            Write terse but helpful explanatory comments.

    //            Create a class named `{_options.ClassName}` with the following behavior:
    //            {_options.BehaviorPrompt}
    //            """);
    //        var sanitized = Sanitize(response);

    //        _logger.LogInformation(sanitized);

    //        await layer.WriteFileAsync("Program.cs", sanitized);

    //        var projectPath = layer.GetAbsolutePath($"FizzBuzz.csproj");
    //        var project = new CSharpProject(projectPath, new NullLogger<DotNetProject>());
    //        var success = await project.TryCompileAsync();
    //        if (success)
    //        {
    //            _logger.LogInformation("Can be compiled.");
    //        }
    //        else
    //        {
    //            _logger.LogInformation("Can not be compiled.");
    //            throw new InvalidOperationException("Can't compile");
    //        }
    //    }

    //    private string Sanitize(string input)
    //    {
    //        string pattern = @"^\s*```\s*csharp|^\s*```";
    //        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

    //        return result;
    //    }
    //}
}
