using DeGA.Core;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.Extensions.Logging;
using System.Text.RegularExpressions;

namespace DeGA.Generator.CSharp.LayerActions
{
    public class GenerateClass : ILayerAction<GenerateClassOptions>
    {
        private readonly IAIAssistant _assistant;
        private readonly ILogger<GenerateClass> _logger;
        private readonly GenerateClassOptions _options;

        public GenerateClass(IAIAssistant assistant, ILogger<GenerateClass> logger, GenerateClassOptions options)
        {
            _assistant = assistant;
            _logger = logger;
            _options = options;
        }

        public async Task InvokeAsync(Layer layer)
        {
            var response = await _assistant.CompletePromptAsync($"""
                You are a C# code generator. Output only C#, your output will be directly compiled by Roslyn.

                Create a class named `{_options.ClassName}` with the following behavior:
                {_options.BehaviorPrompt}
                """);
            var sanitized = Sanitize(response);

            _logger.LogInformation(sanitized);

            if (CanBeCompiledToClass(sanitized))
            {
                _logger.LogInformation("Can be compiled.");
            }
            else
            {
                _logger.LogInformation("Can not be compiled.");
                throw new InvalidOperationException("Can't compile");
            }
        }

        private string Sanitize(string input)
        {
            string pattern = @"^\s*```\s*csharp|^\s*```";
            string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

            return result;
        }

        public bool CanBeCompiledToClass(string code)
        {
            var syntaxTree = CSharpSyntaxTree.ParseText(code);
            // If we want to introspect the code:
            //var root = (CompilationUnitSyntax)syntaxTree.GetRoot();

            var compilation = CSharpCompilation.Create("DynamicCompilation")
                .AddReferences(MetadataReference.CreateFromFile(typeof(object).Assembly.Location))
                .AddSyntaxTrees(syntaxTree);

            var diagnostics = compilation.GetDiagnostics();
            return !HasErrors(diagnostics);
        }

        private bool HasErrors(IEnumerable<Diagnostic> diagnostics)
        {
            foreach (var diag in diagnostics)
            {
                if (diag.Severity == DiagnosticSeverity.Error)
                {
                    _logger.LogError("Response compile error: {error}", diag.ToString());
                    return true;
                }
            }
            return false;
        }
    }
}
