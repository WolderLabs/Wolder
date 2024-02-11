using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.CSharp;

namespace Wolder.Core.Tools;

[Generator]
public class RunnableInterfaceGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var classDeclarations = context.SyntaxProvider
            .CreateSyntaxProvider(
                predicate: static (s, _) => s is ClassDeclarationSyntax cds && cds.BaseList != null,
                transform: static (ctx, _) => ctx.Node as ClassDeclarationSyntax)
            .Where(static m => m != null);

        var compilationAndClasses = context.CompilationProvider.Combine(classDeclarations.Collect());

        context.RegisterSourceOutput(compilationAndClasses, (spc, source) =>
        {
            var (compilation, classes) = source;
            foreach (var classDeclaration in classes)
            {
                if (classDeclaration == null) continue;

                var model = compilation.GetSemanticModel(classDeclaration.SyntaxTree);
                var classSymbol = model.GetDeclaredSymbol(classDeclaration);
                if (classSymbol == null) continue;

                foreach (var iface in classSymbol.AllInterfaces)
                {
                    if (iface.Name == "IRunnable" || (iface.Name.StartsWith("IRunnable") && iface.IsGenericType))
                    {
                        var interfaceName = $"IRun{classSymbol.Name}";
                        var namespaceName = classSymbol.ContainingNamespace.IsGlobalNamespace ? "" : classSymbol.ContainingNamespace.ToDisplayString();

                        string sourceCode;
                        if (iface.IsGenericType)
                        {
                            var typeArguments = iface.TypeArguments;
                            if (typeArguments.Length == 2)
                            {
                                var parametersType = typeArguments[0];
                                var outputType = typeArguments[1];
                                sourceCode = GenerateGenericInterfaceSource(namespaceName, interfaceName, parametersType, outputType, classSymbol.ContainingNamespace.IsGlobalNamespace);
                            }
                            else
                            {
                                // Fallback for non-standard cases
                                sourceCode = GenerateInterfaceSource(namespaceName, interfaceName, classSymbol.ContainingNamespace.IsGlobalNamespace);
                            }
                        }
                        else
                        {
                            sourceCode = GenerateInterfaceSource(namespaceName, interfaceName, classSymbol.ContainingNamespace.IsGlobalNamespace);
                        }

                        spc.AddSource($"{interfaceName}.g.cs", sourceCode);
                        break; // Assuming only one IRunnable or IRunnable<TParameters, TOutput> per class
                    }
                }
            }
        });
    }

    private static string GenerateInterfaceSource(string namespaceName, string interfaceName, bool isGlobalNamespace)
    {
        if (isGlobalNamespace)
        {
            return $@"
public interface {interfaceName}
{{
}}
";
        }
        else
        {
            return $@"
namespace {namespaceName}
{{
    public interface {interfaceName}
    {{
    }}
}}
";
        }
    }

    private static string GenerateGenericInterfaceSource(string namespaceName, string interfaceName, ITypeSymbol parametersType, ITypeSymbol outputType, bool isGlobalNamespace)
    {
        var parametersTypeName = parametersType.ToDisplayString();
        var outputTypeName = outputType.ToDisplayString();

        if (isGlobalNamespace)
        {
            return $@"
using System.Threading.Tasks;

public interface {interfaceName}
{{
    Task<{outputTypeName}> ExecuteAsync({parametersTypeName} parameters);
}}
";
        }
        else
        {
            return $@"
using System.Threading.Tasks;

namespace {namespaceName}
{{
    public interface {interfaceName}
    {{
        Task<{outputTypeName}> ExecuteAsync({parametersTypeName} parameters);
    }}
}}
";
        }
    }
}
