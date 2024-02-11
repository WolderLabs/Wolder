using System.Linq;
using System.Reflection.Metadata.Ecma335;
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
                predicate: static (s, _) => s is ClassDeclarationSyntax { BaseList: not null },
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
                
                var attribute = classSymbol.GetAttributes()
                    .FirstOrDefault(ad => ad.AttributeClass.Name == "GenerateTypedWorkspaceInterfaceAttribute");
                if (attribute is null) continue;

                if (attribute.AttributeClass == null || attribute.AttributeClass?.TypeArguments.Length != 1)
                    continue;
                var interfaceName = attribute.AttributeClass.TypeArguments[0].Name;
                
                foreach (var iface in classSymbol.AllInterfaces)
                {
                    if (!iface.Name.StartsWith("IRunnable"))
                    {
                        continue;
                    }
                    var name = iface.ToDisplayString();
                    if (name.StartsWith("Wolder.Core.Workspace.IRunnable"))
                    {
                        var namespaceName = classSymbol.ContainingNamespace.IsGlobalNamespace ? "" : classSymbol.ContainingNamespace.ToDisplayString();

                        string? sourceCode = null;
                        if (iface.IsGenericType)
                        {
                            var typeArguments = iface.TypeArguments;
                            if (typeArguments.Length == 1)
                            {
                                var outputType = typeArguments[0];
                                sourceCode = GenerateGenericOutputInterfaceSource(namespaceName, interfaceName, outputType, classSymbol.ContainingNamespace.IsGlobalNamespace);
                            }
                            else if (typeArguments.Length == 2)
                            {
                                var parametersType = typeArguments[0];
                                var outputType = typeArguments[1];
                                sourceCode = GenerateGenericInterfaceSource(namespaceName, interfaceName, parametersType, outputType, classSymbol.ContainingNamespace.IsGlobalNamespace);
                            }
                        }
                        else
                        {
                            sourceCode = GenerateInterfaceSource(namespaceName, interfaceName, classSymbol.ContainingNamespace.IsGlobalNamespace);
                        }

                        if (sourceCode != null)
                        {
                            spc.AddSource($"{interfaceName}.g.cs", sourceCode);
                            break; // Assuming only one IRunnable or IRunnable<TParameters, TOutput> per class
                        }
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

    private static string GenerateGenericOutputInterfaceSource(string namespaceName, string interfaceName,
        ITypeSymbol outputType, bool isGlobalNamespace)
    {
        var outputTypeName = outputType.ToDisplayString();

        if (isGlobalNamespace)
        {
            return $@"
using System.Threading.Tasks;

public interface {interfaceName}
{{
    Task<{outputTypeName}> InvokeAsync();
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
        Task<{outputTypeName}> InvokeAsync();
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
    Task<{outputTypeName}> InvokeAsync({parametersTypeName} parameters);
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
        Task<{outputTypeName}> InvokeAsync({parametersTypeName} parameters);
    }}
}}
";
        }
    }
}
