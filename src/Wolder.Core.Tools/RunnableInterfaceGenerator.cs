using System.Linq;
using System.Text;
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

        var compilationAndClasses = 
            context.CompilationProvider.Combine(classDeclarations.Collect());

        context.RegisterSourceOutput(compilationAndClasses, (spc, source) =>
        {
            var (compilation, classes) = source;
            foreach (var classDeclaration in classes)
            {
                if (classDeclaration == null) continue;

                var model = compilation.GetSemanticModel(classDeclaration.SyntaxTree);
                var classSymbol = model.GetDeclaredSymbol(classDeclaration);
                if (classSymbol == null) continue;

                var runnableName = classSymbol.ToDisplayString();
                
                var attribute = classSymbol.GetAttributes()
                    .FirstOrDefault(ad => 
                        ad.AttributeClass.Name == "GenerateTypedActionInvokeInterfaceAttribute");
                if (attribute is null) continue;

                if (attribute.AttributeClass == null || attribute.AttributeClass?.TypeArguments.Length != 1)
                    continue;
                var interfaceName = attribute.AttributeClass.TypeArguments[0].Name;
                
                foreach (var iface in classSymbol.AllInterfaces)
                {
                    if (!iface.Name.StartsWith("IInvokable") && !iface.Name.StartsWith("IVoidInvokable"))
                    {
                        continue;
                    }
                    var name = iface.ToDisplayString();
                    var isInvokable = name.StartsWith("Wolder.Core.Workspace.IInvokable");
                    var isVoidInvokable = name.StartsWith("Wolder.Core.Workspace.IVoidInvokable");
                    if (isInvokable || isVoidInvokable)
                    {
                        var namespaceName = classSymbol.ContainingNamespace.IsGlobalNamespace 
                            ? null 
                            : classSymbol.ContainingNamespace.ToDisplayString();

                        ITypeSymbol? parametersType = null;
                        ITypeSymbol? outputType = null;

                        if (isVoidInvokable)
                        {
                            if (iface.IsGenericType)
                            {
                                var typeArguments = iface.TypeArguments;
                                if (typeArguments.Length == 1)
                                {
                                    parametersType = typeArguments[0];
                                }
                            }
                        }
                        else
                        {
                            if (iface.IsGenericType)
                            {
                                var typeArguments = iface.TypeArguments;
                                if (typeArguments.Length == 1)
                                {
                                    outputType = typeArguments[0];
                                }
                                else if (typeArguments.Length == 2)
                                {
                                    parametersType = typeArguments[0];
                                    outputType = typeArguments[1];
                                }
                            }
                        }

                        var sourceCode = GenerateInterfaceSource(
                            namespaceName, interfaceName, runnableName, parametersType, outputType);
                        spc.AddSource($"{interfaceName}.g.cs", sourceCode);
                        break; // Assuming only one IInvokable per class
                    }
                }
            }
        });
    }

    private static string GenerateInterfaceSource(
        string? namespaceName, 
        string interfaceName, 
        string runnableName,
        ITypeSymbol? parametersType, 
        ITypeSymbol? outputType
        )
    {
         var parametersTypeName = parametersType?.ToDisplayString();
         var outputTypeName = outputType?.ToDisplayString();

         var builder = new StringBuilder();

         builder.AppendLine("""
             using System.Threading.Tasks;
             using Wolder.Core.Workspace;
             
             """);
         if (namespaceName is not null)
         {
             builder.AppendLine($"""
                 namespace {namespaceName};
                 
                 """);
         }

         if (parametersTypeName is null && outputTypeName is null)
         {
             builder.AppendLine($$"""
                 public interface {{interfaceName}} : IInvokeVoid<{{runnableName}}>, IGeneratedRunner
                 {
                 }
                 """);
         }
         else if (parametersTypeName is not null && outputTypeName is null)
         {
             builder.AppendLine($$"""
                 public interface {{interfaceName}} : IInvokeVoid<{{runnableName}}, {{parametersTypeName}}>, IGeneratedRunner
                 {
                 }
                 """);
         }
         else if (parametersTypeName is null && outputTypeName is not null)
         {
             builder.AppendLine($$"""
                 public interface {{interfaceName}} : IInvoke<{{runnableName}}, {{outputTypeName}}>, IGeneratedRunner
                 {
                 }
                 """);
         }
         else
         {
             builder.AppendLine($$"""
                 public interface {{interfaceName}} : IInvoke<{{runnableName}}, {{parametersTypeName}}, {{outputTypeName}}>, IGeneratedRunner
                 {
                 }
                 """);
         }

         return builder.ToString();
    }
}
